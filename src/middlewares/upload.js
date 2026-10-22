import AWS from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import {
  AWS_CONFIG,
  MAX_MULTER_FIELD_SIZE,
  MAX_MULTER_FILE_SIZE,
  UPLOAD_PATH,
} from '../utils/constants';

const ALLOWED_PPT_MIMETYPES = [
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const s3 = new AWS.S3({
  accessKeyId: AWS_CONFIG.AWS_ACCESS_KEY,
  secretAccessKey: AWS_CONFIG.AWS_SECRET_KEY,
});

const excelFilter = (req, file, cb) => {
  if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheetml')) {
    cb(null, true);
  } else {
    cb({ message: 'Only excel file uploads are allowed!' }, false);
  }
};
const pptFilter = (req, file, cb) => {
  if (ALLOWED_PPT_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb({ message: 'Only ppt related file extensions are allowed!' }, false);
  }
};

const imageFilter = (req, file, cb) => {
  if (file.mimetype.includes('image')) {
    cb(null, true);
  } else {
    cb({ message: 'Only images are allowed!' }, false);
  }
};

const documentFilter = (req, file, cb) => {
  const notAllowedMimetypes = ['application/x-msdos-program'];
  if (!file.mimetype.includes(notAllowedMimetypes)) {
    cb(null, true);
  } else {
    cb({ message: 'Executable files are not allowed!' }, false);
  }
};

const storageDisk = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(path.dirname(require.main.filename), UPLOAD_PATH));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-employee-${file.originalname}`);
  },
});

const storageS3 = multerS3({
  s3,
  bucket: AWS_CONFIG.BUCKET,
  metadata(req, file, cb) {
    cb(null, {});
  },
  key(req, file, cb) {
    // get key name
    const { originalUrl } = req;
    const {
      BANNER_IMAGE,
      CEO_PAGE,
      PROFILE_PICTURE,
      BLOG_THUMBNAIL,
      DOCUMENT_FILE,
      APPLICANT_RESUME,
      FILE_RESOURCE,
      CLINIC_LOGO,
    } = AWS_CONFIG;
    let key = '';
    const s3AllowedPathObj = {
      bannerImage: BANNER_IMAGE,
      ceo: CEO_PAGE,
      users: PROFILE_PICTURE,
      blogs: BLOG_THUMBNAIL,
      documents: DOCUMENT_FILE,
      jobApplicant: APPLICANT_RESUME,
      fileResource: FILE_RESOURCE,
      'clinic-logo': CLINIC_LOGO,
    };
    const s3AllowedPath = Object.keys(s3AllowedPathObj);
    const fileSuffix = `${req.user.id}-${Date.now()}-${file.originalname}`;
    s3AllowedPath.map((allowedPath) => {
      if (originalUrl.includes(allowedPath)) {
        key = `${s3AllowedPathObj[allowedPath]}/${fileSuffix}`;
      }
      return false;
    });

    if (!key) {
      return cb('No matching configuration found');
    }
    cb(null, key);
  },
});

const filter = (fileType) => {
  const filterType = {
    excel: excelFilter,
    image: imageFilter,
    document: documentFilter,
    pptx: pptFilter,
  };
  return filterType[fileType];
};
const diskStoreageTypes = ['excel', 'pptx'];
const memoryStorageTypes = ['image-memory'];
export default (fileType) => {
  const fileFilter = filter(fileType === 'image-memory' ? 'image' : fileType);

  let storage;
  if (diskStoreageTypes.includes(fileType)) {
    storage = storageDisk;
  } else if (memoryStorageTypes.includes(fileType)) {
    storage = multer.memoryStorage();
  } else {
    storage = storageS3;
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_MULTER_FILE_SIZE, fieldSize: MAX_MULTER_FIELD_SIZE },
  });
};
