const amqp = require('amqplib');
const Jimp = require('jimp');
const { ObjectId, GridFSBucket } = require('mongodb');
const { getDbReference, connectToDb } = require('./lib/mongo');

async function generateThumbnail(photoId) {
  try {
    if (!ObjectId.isValid(photoId)) {
      throw new Error(`Invalid photoId: ${photoId}`);
    }

    const db = getDbReference();
    if (!db) {
      throw new Error('Database reference is null or undefined');
    }
    console.log('Database reference:', db);

    const bucket = new GridFSBucket(db, { bucketName: 'photos' });
    const thumbBucket = new GridFSBucket(db, { bucketName: 'thumbs' });

    const downloadStream = bucket.openDownloadStream(ObjectId(photoId));
    let imageData = Buffer.alloc(0);

    downloadStream.on('data', (chunk) => {
      imageData = Buffer.concat([imageData, chunk]);
    });

    downloadStream.on('end', async () => {
      try {
        const image = await Jimp.read(imageData);
        image.resize(100, 100);
        const thumbnailBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        // Use the same photoId for the thumbnail
        const uploadStream = thumbBucket.openUploadStreamWithId(ObjectId(photoId), photoId.toString(), {
          metadata: { contentType: 'image/jpeg', originalPhotoId: photoId },
        });
        uploadStream.end(thumbnailBuffer, async () => {
          console.log(`Thumbnail generated for photoId ${photoId}`);

          // Update the original photo metadata with the thumbnail ID
          const filesCollection = db.collection('photos.files');
          await filesCollection.updateOne(
            { _id: new ObjectId(photoId) },
            { $set: { 'metadata.thumbId': photoId } } // Use the same photoId for thumbId
          );

          console.log(`Thumbnail ID ${photoId} associated with photoId ${photoId}`);
        });
      } catch (error) {
        console.error('Error processing image:', error);
      }
    });

    downloadStream.on('error', (err) => {
      console.error('Error downloading photo for thumbnail generation:', err);
    });
  } catch (error) {
    console.error('Error in generateThumbnail:', error);
  }
}

async function startConsumer() {
  try {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();
    const queue = 'thumbnail_generation';

    await channel.assertQueue(queue, { durable: true });

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        const { photoId } = JSON.parse(msg.content.toString());
        await generateThumbnail(photoId);
        channel.ack(msg);
      }
    });

    console.log('RabbitMQ consumer is up and running');
  } catch (err) {
    console.error('Error starting RabbitMQ consumer:', err);
    process.exit(1);
  }
}

connectToDb(() => {
  console.log('Connected to DB, starting consumer');
  startConsumer();
});
