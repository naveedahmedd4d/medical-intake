import express from 'express';
import { SuccessResponse } from '../../utils/helper';
import {
  calculateEstimatedPrice,
  getAllPricingTiers,
  calculateAddProviderImpact,
} from '../../utils/pricingHelpers';
import { Request, SwaggerDoc } from '../../utils/decorators';
import models from '../../models';

const { Clinic } = models;

class PricingController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get('/tiers', this.getPricingTiers);
    this.router.get('/estimate', this.getEstimate);
    this.router.get('/impact/add-provider', this.getAddProviderImpact);
    return this.router;
  }

  @SwaggerDoc({
    tags: ['Pricing'],
    description: 'Get all pricing tiers (informational display)',
    security: [],
  })
  @Request
  static async getPricingTiers(req, res) {
    const tiers = getAllPricingTiers();
    SuccessResponse(res, {
      pricingModel: 'graduated',
      description:
        'Pricing automatically adjusts based on total provider count. All providers are charged at the same per-seat rate.',
      tiers,
    });
  }

  @SwaggerDoc({
    tags: ['Pricing'],
    description: 'Get estimated monthly cost for current clinic provider count',
  })
  @Request
  static async getEstimate(req, res) {
    const clinic = await Clinic.findByPk(req.auth.clinicId, {
      attributes: ['id', 'clinicName', 'providerCount'],
    });

    if (!clinic) {
      return SuccessResponse(res, {
        error: 'Clinic not found',
      });
    }

    const estimate = calculateEstimatedPrice(clinic.providerCount || 0);

    SuccessResponse(res, {
      clinicId: clinic.id,
      clinicName: clinic.clinicName,
      ...estimate,
    });
  }

  @SwaggerDoc({
    tags: ['Pricing'],
    description:
      'Calculate pricing impact of adding a new provider (shows tier changes and cost increase)',
  })
  @Request
  static async getAddProviderImpact(req, res) {
    const clinic = await Clinic.findByPk(req.auth.clinicId, {
      attributes: ['id', 'clinicName', 'providerCount'],
    });

    if (!clinic) {
      return SuccessResponse(res, {
        error: 'Clinic not found',
      });
    }

    const impact = calculateAddProviderImpact(clinic.providerCount || 0);

    SuccessResponse(res, {
      clinicId: clinic.id,
      clinicName: clinic.clinicName,
      ...impact,
    });
  }
}

export default PricingController;
