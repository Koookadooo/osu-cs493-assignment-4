const { Router } = require('express');
const { GridFSBucket, ObjectId } = require('mongodb');
const { getDbReference } = require('../lib/mongo');

const router = Router();

router.get('/photos/:id.:ext', async (req, res, next) => {
  const db = getDbReference();
  const bucket = new GridFSBucket(db, { bucketName: 'photos' });
  const photoId = req.params.id;

  if (!ObjectId.isValid(photoId)) {
    return res.status(400).send({ error: 'Invalid photo ID format' });
  }

  const downloadStream = bucket.openDownloadStream(ObjectId(photoId));

  downloadStream.on('file', (file) => {
    const metadata = file.metadata;
    const photoUrl = `/media/photos/${photoId}.${file.metadata.contentType.split('/')[1]}`;
    console.log('Photo metadata:', metadata);
    console.log('Photo URL:', photoUrl);
    res.status(200).send({
      _id: photoId,
      businessId: metadata.businessId,
      caption: metadata.caption,
      contentType: metadata.contentType,
      url: photoUrl
    });
  });

  downloadStream.on('error', (err) => {
    if (err.code === 'ENOENT') {
      next();
    } else {
      next(err);
    }
  });

  downloadStream.pipe(res);
});

router.get('/thumbs/:id.:ext', async (req, res, next) => {
  const db = getDbReference();
  const bucket = new GridFSBucket(db, { bucketName: 'thumbs' });
  const thumbId = req.params.id;

  if (!ObjectId.isValid(thumbId)) {
    return res.status(400).send({ error: 'Invalid thumbnail ID format' });
  }

  const downloadStream = bucket.openDownloadStream(ObjectId(thumbId));

  downloadStream.on('file', (file) => {
    res.status(200).type(file.metadata.contentType);
  });

  downloadStream.on('error', (err) => {
    if (err.code === 'ENOENT') {
      next();
    } else {
      next(err);
    }
  });

  downloadStream.pipe(res);
});

module.exports = router;
