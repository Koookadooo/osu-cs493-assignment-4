const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const { Router } = require('express');
const { GridFSBucket, ObjectId } = require('mongodb');
const { getDbReference } = require('../lib/mongo');
const { validateAgainstSchema } = require('../lib/validation');
const amqp = require('amqplib');

const router = Router();

const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png'
};

const storage = multer.diskStorage({
  destination: `${__dirname}/uploads`,
  filename: (req, file, callback) => {
    const filename = crypto.pseudoRandomBytes(16).toString('hex');
    const extension = imageTypes[file.mimetype];
    callback(null, `${filename}.${extension}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, callback) => {
    callback(null, !!imageTypes[file.mimetype]);
  }
});

async function sendToQueue(photoId, businessId) {
  try {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();
    const queue = 'thumbnail_generation';
    await channel.assertQueue(queue, { durable: true });
    const message = JSON.stringify({ photoId, businessId });
    channel.sendToQueue(queue, Buffer.from(message), { persistent: true });
    console.log('Sent message to queue:', message);
    await channel.close();
    await connection.close();
  } catch (err) {
    console.error('Error sending message to queue:', err);
  }
}

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send({ error: 'Invalid file format. Only JPEG and PNG are allowed.' });
  }
  if (!validateAgainstSchema(req.body, { businessId: { required: true }, caption: { required: false } })) {
    return res.status(400).send({ error: 'Request body is not a valid photo object' });
  }
  try {
    const db = getDbReference();
    const bucket = new GridFSBucket(db, { bucketName: 'photos' });
    const metadata = {
      businessId: new ObjectId(req.body.businessId),
      caption: req.body.caption,
      contentType: req.file.mimetype
    };
    const uploadStream = bucket.openUploadStream(req.file.filename, { metadata });
    fs.createReadStream(req.file.path).pipe(uploadStream)
      .on('error', (err) => {
        res.status(500).send({ error: 'Error uploading file to GridFS.' });
      })
      .on('finish', async (file) => {
        await fs.promises.unlink(req.file.path);
        const photoId = file._id;
        await sendToQueue(photoId, req.body.businessId);
        res.status(201).send({ id: photoId, links: { photo: `/photos/${photoId}`, business: `/businesses/${req.body.businessId}` } });
      });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Error inserting photo into DB. Please try again later.' });
  }
});

// GET /photos/{id} - Route to fetch info about a specific photo.
router.get('/:id', async (req, res, next) => {
  try {
    console.log('Fetching photo metadata:', req.params.id);
    const db = getDbReference();
    console.log('Database reference:', db);
    const filesCollection = db.collection('photos.files');
    const photoId = req.params.id;

    if (!ObjectId.isValid(photoId)) {
      return res.status(400).send({ error: 'Invalid photo ID format' });
    }

    const photo = await filesCollection.findOne({ _id: new ObjectId(photoId) });

    if (!photo) {
      return res.status(404).send({ error: 'Photo not found' });
    }

    const metadata = photo.metadata;
    const photoUrl = `/media/photos/${photoId}.${photo.metadata.contentType.split('/')[1]}`;
    const thumbUrl = metadata.thumbId ? `/media/thumbs/${metadata.thumbId}.jpg` : null;
    console.log('Photo metadata:', metadata);
    console.log('Photo URL:', photoUrl);

    res.status(200).send({
      _id: photoId,
      businessId: metadata.businessId,
      caption: metadata.caption,
      contentType: metadata.contentType,
      thumbID: metadata.thumbId,
      url: photoUrl,
      thumbUrl: thumbUrl
    });
  } catch (err) {
    console.error('Error retrieving photo metadata:', err);
    res.status(500).send({ error: 'Unable to fetch photo. Please try again later.' });
  }
});

module.exports = router;
