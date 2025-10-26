const fs = require('fs');

async function main() {
    const response = await fetch('https://platform.openai.com/docs/models');
    const html = await response.text();

    fs.writeFileSync('openaimodels.html', html);

    process.exit(0);
}

main();