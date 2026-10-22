import { BlobServiceClient } from '@azure/storage-blob';
import debugObj from 'debug';
import { AZURE_STORAGE_CONFIG } from './constants';

const debug = debugObj('api:azure-storage');
let blobServiceClient;

export const uploadFileToAzure = async (fileBuffer, fileName, mimeType, folder = '') => {
  if (!AZURE_STORAGE_CONFIG.CONNECTION_STRING) {
    throw new Error('Azure Storage Connection String is not configured.');
  }

  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONFIG.CONNECTION_STRING
    );
  }

  const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONFIG.CONTAINER_NAME);

  await containerClient.createIfNotExists({
    access: 'blob',
  });

  const blobName = folder ? `${folder}/${fileName}` : fileName;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(fileBuffer, {
    blobHTTPHeaders: { blobContentType: mimeType },
  });

  return blockBlobClient.url;
};

export const deleteFileFromAzure = async (fileUrl) => {
  if (!fileUrl) {
    return;
  }

  try {
    if (!blobServiceClient) {
      blobServiceClient = BlobServiceClient.fromConnectionString(
        AZURE_STORAGE_CONFIG.CONNECTION_STRING
      );
    }

    const containerClient = blobServiceClient.getContainerClient(
      AZURE_STORAGE_CONFIG.CONTAINER_NAME
    );

    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');
    const blobName = pathParts.slice(2).join('/');

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  } catch (error) {
    debug('Error deleting file: %O', error);
  }
};
