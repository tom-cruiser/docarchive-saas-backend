const AWS = require('aws-sdk');

// Configure Wasabi S3
const s3 = new AWS.S3({
  endpoint: process.env.WASABI_ENDPOINT,
  region: process.env.WASABI_REGION,
  accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
  secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  signatureVersion: 'v4',
});

/**
 * Upload file to Wasabi
 */
const uploadFile = async (file, key, metadata = {}) => {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    Metadata: metadata,
    ServerSideEncryption: 'AES256',
  };

  return s3.upload(params).promise();
};

/**
 * Download file from Wasabi
 */
const downloadFile = async (key) => {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
  };

  return s3.getObject(params).promise();
};

/**
 * Delete file from Wasabi
 */
const deleteFile = async (key) => {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
  };

  return s3.deleteObject(params).promise();
};

/**
 * Generate signed URL for temporary access
 */
const getSignedUrl = (key, expiresIn = 3600) => {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
    Expires: expiresIn,
  };

  return s3.getSignedUrl('getObject', params);
};

/**
 * Copy file within Wasabi
 */
const copyFile = async (sourceKey, destinationKey) => {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    CopySource: `${process.env.WASABI_BUCKET}/${sourceKey}`,
    Key: destinationKey,
    ServerSideEncryption: 'AES256',
  };

  return s3.copyObject(params).promise();
};

/**
 * List files in a folder
 */
const listFiles = async (prefix) => {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    Prefix: prefix,
  };

  return s3.listObjectsV2(params).promise();
};

module.exports = {
  s3,
  uploadFile,
  downloadFile,
  deleteFile,
  getSignedUrl,
  copyFile,
  listFiles,
};
