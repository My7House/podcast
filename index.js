require('dotenv').config()

const Podcast = require('podcast');
const AWS = require('aws-sdk');

const yamlFront = require('yaml-front-matter');
const path = require('path');

const bucketName = process.env.S3_BUCKET_NAME;

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();
const cloudFront = new AWS.CloudFront();

const domain = 'http://d11ni38cee4hqo.cloudfront.net';
const logo = domain + '/logo.jpg'

const feed = new Podcast({
    title: 'My7House Podcast',
    description: 'Découvrez ou redécouvrez les épisodes de cette série de Mix dédié à la House musique.',
    feed_url: 'd11ni38cee4hqo.cloudfront.net/rss.xml',
    site_url: 'https://www.facebook.com/pages/category/TV-Show/My7House-1802971976622564',
    image_url: logo,
    author: 'My7House',
    language: 'en',
    categories: ['Music'],
    pubDate: new Date(),
    ttl: '60',
    itunesAuthor: 'My7House',
    itunesSubtitle: '',
    itunesSummary: 'Découvrez ou redécouvrez les épisodes de cette série de Mix dédié à la House musique.',
    itunesOwner: { name: 'My7House' },
    itunesExplicit: false,
    itunesCategory: {
        "text": "Music",
    },
    itunesImage: logo
});

s3.listObjectsV2({
    Bucket: bucketName,
}).promise().then(data => (
    data.Contents.filter(object => path.extname(object.Key) == '.md')
)).then(objects => (
    Promise.all(objects.map(object => s3.getObject({
        Bucket: bucketName,
        Key: object.Key,
    }).promise().then(data => {
        const config = yamlFront.loadFront(data.Body);

        return s3.headObject({
            Bucket: bucketName,
            Key: config.key,
        }).promise().then(data => ({
            ...config,
            size: data.ContentLength,
        })).catch(err => Promise.resolve(null));
    })))
)).then(episodes => {
    console.log(episodes);

    return episodes;
}).then(episodes => episodes.filter(episode => (
    episode !== null && Date.parse(episode.pubDate) <= new Date()
))).then(episodes => episodes.sort((a, b) => {
    if (a.pubDate === b.pubDate) {
        return 0;
    }

    return a.pubDate < b.pubDate ? -1 : 1;
})).then(episodes => episodes.forEach(episode => {

    const file = domain+'/'+encodeURIComponent(episode.key);

    console.log(episode);

    feed.addItem({
        title: episode.title,
        description: episode.__content,
        url: file,
        categories: ['house music','garage', 'soulful', 'djset'], // optional - array of item categories
        date: episode.pubDate,
        enclosure : {
            url:file,
            size: episode.size
        },
        itunesAuthor: episode.author,
        itunesExplicit: false,
        itunesSubtitle: episode.subtitle,
        itunesSummary: '',
        itunesDuration: episode.duration,
        itunesKeywords: ['house music','garage', 'soulful', 'djset']
    });
})).then(() => (
    s3.putObject({
        Body: feed.buildXml(),
        Bucket: bucketName,
        Key: 'rss.xml',
    }).promise()
)).then(() => {
    cloudFront.createInvalidation({
        DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
            CallerReference: new Date().valueOf().toString(),
            Paths: {
                Quantity: 1,
                Items: [
                    '/rss.xml',
                ]
            }
        },
    }).promise()
});
