require('./serve-preview.cjs').servePreview({directory:require('node:path').join(__dirname,'../build/ui-cards'),port:Number(process.env.UI_PREVIEW_PORT??7462),label:'Card component design'});
