import readline from 'readline';
import models from '../src/models/index';

const {
  User,
  UserRole,
  Provider,
  PasswordReset,
  UserInvitation,
  PatientSummary,
  IntakeSession,
  IntakeResponse,
  AuditLog,
  SubscriptionAcceptance,
  Subscription,
  Clinic,
  ClinicLocation,
  BillingEvent,
  ProcessedWebhookEvent,
  Template,
  TemplateQuestion,
  sequelize,
} = models;

// Safety: Only allow in development environment
const ALLOWED_ENVIRONMENTS = ['development', 'test', 'local'];
const currentEnv = 'development';

// Protected account - this account will never be deleted
const PROTECTED_SUPER_ADMIN_EMAIL = 'superadmin@mira.com';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Create a readline interface for user input
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for confirmation
 */
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Delete all users with safety checks
 */
async function deleteAllUsers() {
  console.log(`${colors.cyan}===========================================`);
  console.log('   DELETE ALL USERS SCRIPT');
  console.log(`===========================================${colors.reset}\n`);

  // Environment check
  console.log(`${colors.blue}Current Environment: ${currentEnv}${colors.reset}`);

  if (!ALLOWED_ENVIRONMENTS.includes(currentEnv)) {
    console.error(
      `${colors.red}ERROR: This script can only be run in ${ALLOWED_ENVIRONMENTS.join(
        ', '
      )} environments!${colors.reset}`
    );
    console.error(`${colors.red}Current environment is: ${currentEnv}${colors.reset}`);
    process.exit(1);
  }

  const rl = createReadlineInterface();

  try {
    // Check if protected super admin exists
    const protectedAdmin = await User.findOne({
      where: { email: PROTECTED_SUPER_ADMIN_EMAIL },
    });

    // Get current user counts (excluding protected super admin)
    const { Op } = sequelize.Sequelize;
    const userCount = await User.count({
      where: {
        email: { [Op.ne]: PROTECTED_SUPER_ADMIN_EMAIL },
      },
    });
    const totalActiveUsers = await User.count();
    const deletedUserCount = (await User.count({ paranoid: false })) - totalActiveUsers;

    console.log(`\n${colors.yellow}Current Database Statistics:${colors.reset}`);
    console.log(`  Active Users: ${totalActiveUsers}`);
    console.log(`  Users to be deleted: ${userCount}`);
    if (protectedAdmin) {
      console.log(`  ${colors.green}Protected (${PROTECTED_SUPER_ADMIN_EMAIL}): 1${colors.reset}`);
    }
    console.log(`  Soft-Deleted Users: ${deletedUserCount}`);
    console.log(`  Total Users (including deleted): ${totalActiveUsers + deletedUserCount}\n`);

    // Get user breakdown by role (excluding protected admin)
    const usersByRole = await User.findAll({
      attributes: ['role', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: {
        email: { [Op.ne]: PROTECTED_SUPER_ADMIN_EMAIL },
      },
      group: ['role'],
    });

    console.log(`${colors.yellow}Users by Role (excluding protected admin):${colors.reset}`);
    usersByRole.forEach((role) => {
      console.log(`  ${role.role}: ${role.dataValues.count}`);
    });
    console.log('');

    // Ask for deletion type
    console.log(`${colors.magenta}Choose deletion type:${colors.reset}`);
    console.log('1. Soft Delete (recommended - users can be recovered)');
    console.log('2. Hard Delete (permanent - cannot be recovered)');
    console.log('3. Hard Delete ALL (including soft-deleted users)\n');

    const deletionType = await askQuestion(
      rl,
      `${colors.cyan}Enter your choice (1, 2, or 3): ${colors.reset}`
    );

    if (!['1', '2', '3'].includes(deletionType)) {
      console.log(`${colors.red}Invalid choice. Exiting.${colors.reset}`);
      rl.close();
      process.exit(1);
    }

    // Confirmation prompts
    console.log(
      `\n${colors.red}WARNING: This will delete ${userCount} active user(s) from the database!${colors.reset}`
    );

    const confirm1 = await askQuestion(
      rl,
      `${colors.yellow}Are you sure you want to continue? Type 'yes' to proceed: ${colors.reset}`
    );

    if (confirm1.toLowerCase() !== 'yes') {
      console.log(`${colors.green}Operation cancelled.${colors.reset}`);
      rl.close();
      process.exit(0);
    }

    const confirm2 = await askQuestion(
      rl,
      `${colors.red}FINAL WARNING: This action will delete all users. Type 'DELETE ALL USERS' to confirm: ${colors.reset}`
    );

    if (confirm2 !== 'DELETE ALL USERS') {
      console.log(`${colors.green}Operation cancelled.${colors.reset}`);
      rl.close();
      process.exit(0);
    }

    console.log(`\n${colors.cyan}Starting deletion process...${colors.reset}`);
    console.log(
      `${colors.green}Note: Super admin (${PROTECTED_SUPER_ADMIN_EMAIL}) will be preserved.${colors.reset}\n`
    );

    const transaction = await sequelize.transaction();

    try {
      let deletedCount = 0;
      // const { Op } = sequelize.Sequelize;

      // Get IDs of users to be deleted (excluding protected admin)
      const usersToDelete = await User.findAll({
        where: {
          email: { [Op.ne]: PROTECTED_SUPER_ADMIN_EMAIL },
        },
        attributes: ['id'],
        paranoid: deletionType !== '3',
        transaction,
      });

      const userIdsToDelete = usersToDelete.map((user) => user.id);

      if (deletionType === '1') {
        // Soft delete (paranoid mode)
        console.log(
          `${colors.blue}Performing soft delete (users will be marked as deleted)...${colors.reset}`
        );
        deletedCount = await User.destroy({
          where: {
            email: { [Op.ne]: PROTECTED_SUPER_ADMIN_EMAIL },
          },
          transaction,
        });
      } else if (deletionType === '2') {
        // Hard delete active users only
        console.log(
          `${colors.blue}Performing hard delete (active users will be permanently deleted)...${colors.reset}`
        );

        // Get provider IDs for users being deleted
        const providersToDelete = await Provider.findAll({
          where: {
            userId: { [Op.in]: userIdsToDelete },
          },
          attributes: ['id'],
          transaction,
        });
        const providerIdsToDelete = providersToDelete.map((provider) => provider.id);

        // Get intake session IDs for providers being deleted
        const intakeSessionsToDelete = await IntakeSession.findAll({
          where: {
            providerId: { [Op.in]: providerIdsToDelete },
          },
          attributes: ['id'],
          transaction,
        });
        const intakeSessionIdsToDelete = intakeSessionsToDelete.map((session) => session.id);

        // Delete related records first (only for users being deleted)
        // Order: IntakeResponse → PatientSummary → IntakeSession → Provider → UserRole/PasswordReset/UserInvitation → User

        if (intakeSessionIdsToDelete.length > 0) {
          console.log('  - Deleting IntakeResponses...');
          await IntakeResponse.destroy({
            where: {
              sessionId: { [Op.in]: intakeSessionIdsToDelete },
            },
            force: true,
            transaction,
          });
        }

        if (providerIdsToDelete.length > 0 || intakeSessionIdsToDelete.length > 0) {
          console.log('  - Deleting PatientSummaries...');
          const patientSummaryConditions = [];
          if (providerIdsToDelete.length > 0) {
            patientSummaryConditions.push({ providerId: { [Op.in]: providerIdsToDelete } });
          }
          if (intakeSessionIdsToDelete.length > 0) {
            patientSummaryConditions.push({
              intakeSessionId: { [Op.in]: intakeSessionIdsToDelete },
            });
          }
          await PatientSummary.destroy({
            where: {
              [Op.or]: patientSummaryConditions,
            },
            force: true,
            transaction,
          });
        }

        if (providerIdsToDelete.length > 0) {
          console.log('  - Deleting IntakeSessions...');
          await IntakeSession.destroy({
            where: {
              providerId: { [Op.in]: providerIdsToDelete },
            },
            force: true,
            transaction,
          });
        }

        console.log('  - Deleting Providers...');
        await Provider.destroy({
          where: {
            userId: { [Op.in]: userIdsToDelete },
          },
          force: true,
          transaction,
        });

        console.log('  - Deleting UserRoles...');
        await UserRole.destroy({
          where: {
            userId: { [Op.in]: userIdsToDelete },
          },
          force: true,
          transaction,
        });

        console.log('  - Deleting PasswordResets...');
        await PasswordReset.destroy({
          where: {
            userId: { [Op.in]: userIdsToDelete },
          },
          force: true,
          transaction,
        });

        console.log('  - Deleting UserInvitations...');
        await UserInvitation.destroy({
          where: {
            invitedByUserId: { [Op.in]: userIdsToDelete },
          },
          force: true,
          transaction,
        });

        console.log('  - Deleting AuditLogs...');
        await AuditLog.destroy({
          where: {
            userId: { [Op.in]: userIdsToDelete },
          },
          force: true,
          transaction,
        });

        console.log('  - Deleting SubscriptionAcceptances...');
        await SubscriptionAcceptance.destroy({
          where: {
            userId: { [Op.in]: userIdsToDelete },
          },
          force: true,
          individualHooks: false, // Bypass beforeDestroy hook
          transaction,
        });

        console.log('  - Deleting Users...');
        deletedCount = await User.destroy({
          where: {
            email: { [Op.ne]: PROTECTED_SUPER_ADMIN_EMAIL },
          },
          force: true,
          transaction,
        });
      } else if (deletionType === '3') {
        // Hard delete ALL users (including soft-deleted)
        console.log(
          `${colors.blue}Performing hard delete of ALL users (including soft-deleted)...${colors.reset}`
        );

        // Global hard delete order (including soft-deleted):
        // IntakeResponse → PatientSummary → IntakeSession → Provider →
        // UserRole / PasswordReset / UserInvitation → AuditLog → SubscriptionAcceptance → User

        console.log('  - Deleting all IntakeResponses...');
        await IntakeResponse.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all PatientSummaries...');
        await PatientSummary.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all IntakeSessions...');
        await IntakeSession.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all Providers...');
        await Provider.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all UserRoles...');
        await UserRole.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all PasswordResets...');
        await PasswordReset.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all UserInvitations...');
        await UserInvitation.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all AuditLogs...');
        await AuditLog.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all SubscriptionAcceptances...');
        await SubscriptionAcceptance.destroy({
          where: {},
          force: true,
          paranoid: false,
          individualHooks: false, // Bypass beforeDestroy hook
          transaction,
        });

        console.log('  - Deleting all Users...');
        deletedCount = await User.destroy({
          where: {
            email: { [Op.ne]: PROTECTED_SUPER_ADMIN_EMAIL },
          },
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all TemplateQuestions...');
        await TemplateQuestion.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all Templates...');
        await Template.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all BillingEvents...');
        await BillingEvent.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all ProcessedWebhookEvents...');
        await ProcessedWebhookEvent.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all Subscriptions...');
        await Subscription.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all ClinicLocations...');
        await ClinicLocation.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });

        console.log('  - Deleting all Clinics...');
        await Clinic.destroy({
          where: {},
          force: true,
          paranoid: false,
          transaction,
        });
      }

      await transaction.commit();

      console.log(`\n${colors.green}===========================================`);
      console.log('   DELETION COMPLETE');
      console.log('===========================================');
      console.log(`Users deleted: ${deletedCount}`);
      console.log(`Protected super admin: ${PROTECTED_SUPER_ADMIN_EMAIL} (preserved)`);
      console.log(`Deletion type: ${deletionType === '1' ? 'Soft Delete' : 'Hard Delete'}`);
      console.log(`Environment: ${currentEnv}`);
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log(`===========================================${colors.reset}\n`);

      rl.close();
      process.exit(0);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  } catch (error) {
    console.error(`\n${colors.red}Error deleting users:${colors.reset}`, error);
    rl.close();
    process.exit(1);
  }
}

// Run the script
deleteAllUsers();
