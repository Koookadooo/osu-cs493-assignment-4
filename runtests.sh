#!/bin/bash

# Variables
API_URL="http://localhost:8000"
PHOTO_PATH="./test/test-image.jpg" # Ensure you have a test image in the specified path

# Fetch a valid business ID
echo "Fetching a valid business ID..."
BUSINESS_ID=$(curl -s "$API_URL/businesses" | jq -r '.businesses[0]._id')

if [ "$BUSINESS_ID" == "null" ]; then
  echo "Failed to fetch a valid business ID"
  exit 1
fi

echo "Using business ID: $BUSINESS_ID"

# Test Photo Upload
echo "Uploading photo..."
UPLOAD_RESPONSE=$(curl -s -F "businessId=$BUSINESS_ID" -F "file=@$PHOTO_PATH" $API_URL/photos)
PHOTO_ID=$(echo $UPLOAD_RESPONSE | jq -r '.id')

if [ "$PHOTO_ID" == "null" ]; then
  echo "Photo upload failed"
  echo "Response: $UPLOAD_RESPONSE"
  exit 1
fi

echo "Photo uploaded successfully. Photo ID: $PHOTO_ID"

# Wait for the thumbnail to be generated
echo "Waiting for thumbnail generation..."
sleep 5

# Test Photo Metadata Retrieval
echo "Retrieving photo metadata..."
PHOTO_METADATA=$(curl -s $API_URL/photos/$PHOTO_ID)

if [ "$(echo $PHOTO_METADATA | jq -r '._id')" != "$PHOTO_ID" ]; then
  echo "Failed to retrieve photo metadata"
  echo "Response: $PHOTO_METADATA"
  exit 1
fi
echo "Photo metadata retrieved successfully"
echo "Photo metadata: $PHOTO_METADATA"

# Check if the thumbnail is linked in the metadata
echo "Checking if the thumbnail is linked in the metadata..."
THUMBNAIL_ID=$(echo $PHOTO_METADATA | jq -r '.thumbID')
if [ "$THUMBNAIL_ID" == "null" ]; then
  echo "Thumbnail not linked in metadata"
  exit 1
fi
echo "Thumbnail linked in metadata. Thumbnail ID: $THUMBNAIL_ID"

# Get the photo url from the metadata
echo "Getting photo url from metadata..."
PHOTO_URL=$(echo $PHOTO_METADATA | jq -r '.url')
echo "Photo URL: $PHOTO_URL"

# Get the thumbnail url from the metadata
echo "Getting thumbnail url from metadata..."
THUMBNAIL_URL=$(echo $PHOTO_METADATA | jq -r '.thumbUrl')
echo "Thumbnail URL: $THUMBNAIL_URL"

# Test Downloading the Photo
echo "Downloading photo..."
PHOTO_DOWNLOAD=$(curl -s -o /dev/null -w "%{http_code}" $API_URL$PHOTO_URL)

if [ "$PHOTO_DOWNLOAD" -ne 200 ]; then
  echo "Failed to download photo"
  exit 1
fi
echo "Photo downloaded successfully"
echo "Photo download: $PHOTO_DOWNLOAD"

# Test Downloading the Thumbnail
echo "Downloading thumbnail..."
THUMBNAIL_DOWNLOAD=$(curl -s -o /dev/null -w "%{http_code}" $API_URL$THUMBNAIL_URL)

if [ "$THUMBNAIL_DOWNLOAD" -ne 200 ]; then
  echo "Failed to download thumbnail"
  exit 1
fi
echo "Thumbnail downloaded successfully"
echo "Thumbnail download: $THUMBNAIL_DOWNLOAD"

echo "All tests passed successfully"
exit 0
