const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_BYTES = 100 * 1024 * 1024; // 100MB — Cloudinary free plan limit

const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, message: 'No file provided' });
    }

    if (req.file.size > MAX_BYTES) {
      fs.unlink(req.file.path, () => {});
      return res.status(413).json({
        success: false,
        message: `File too large (${(req.file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 100MB.`,
      });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'lms/videos',
          chunk_size: 20 * 1024 * 1024, // 20MB chunks
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      fs.createReadStream(req.file.path).pipe(stream);
    });

    fs.unlink(req.file.path, () => {});

    return res.status(200).json({
      success: true,
      data: {
        url:      result.secure_url,
        publicId: result.public_id,
        duration: Math.round((result.duration || 0) / 60),
        format:   result.format,
        bytes:    result.bytes,
      },
    });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('[uploadVideo]', err);

    if (err.http_code === 413) {
      return res.status(413).json({
        success: false,
        message: 'Cloudinary rejected the file. Keep videos under 100MB or use a YouTube/Vimeo URL instead.',
      });
    }

    return res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
  }
};

module.exports = { uploadVideo };