const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

const ALLOWED_MIMETYPES = ['video/mp4', 'video/webm', 'video/ogg', 'image/jpeg', 'image/png', 'image/gif'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Magic byte signatures for allowed types
const MAGIC_BYTES = [
  { mime: 'image/jpeg',  bytes: [0xFF, 0xD8, 0xFF],              offset: 0 },
  { mime: 'image/png',   bytes: [0x89, 0x50, 0x4E, 0x47],        offset: 0 },
  { mime: 'image/gif',   bytes: [0x47, 0x49, 0x46, 0x38],        offset: 0 },
  { mime: 'video/webm',  bytes: [0x1A, 0x45, 0xDF, 0xA3],        offset: 0 },
  { mime: 'video/mp4',   bytes: [0x66, 0x74, 0x79, 0x70],        offset: 4 }, // 'ftyp'
  { mime: 'video/ogg',   bytes: [0x4F, 0x67, 0x67, 0x53],        offset: 0 }, // 'OggS'
];

function verifyMagicBytes(filePath, claimedMime) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);

  const signatures = MAGIC_BYTES.filter(s => s.mime === claimedMime);
  if (signatures.length === 0) return false;

  return signatures.some(sig =>
    sig.bytes.every((byte, i) => buf[sig.offset + i] === byte)
  );
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Неподдерживаемый тип файла. Разрешены: mp4, webm, jpg, png, gif'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

router.post('/', authenticateToken, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const filePath = req.file.path;

  // Verify actual file content matches declared MIME type
  if (!verifyMagicBytes(filePath, req.file.mimetype)) {
    fs.unlinkSync(filePath);
    return res.status(400).json({ error: 'Содержимое файла не соответствует его типу' });
  }

  res.json({ success: true, fileUrl: `/uploads/${req.file.filename}` });
});

module.exports = router;
