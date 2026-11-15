require('./serve-preview.cjs').servePreview({directory:require('node:path').join(__dirname,'../build/web-desktop'),port:Number(process.env.PORT??7457),label:'Game preview'});
