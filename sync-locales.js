const fs = require('fs');
const path = require('path');

const DIR_LOCALES = './app/locale';

// Cores ANSI
const RESET = "\x1b[0m";
const BRIGHT_GREEN = "\x1b[32m";
const BRIGHT_BLUE = "\x1b[34m";
const BRIGHT_GRAY = "\x1b[90m";

// Função para atualizar os arquivos JSON com base no template.json
function update(filename) {
    const templatePath = path.join(DIR_LOCALES, 'template.json');
    const filePath = path.join(DIR_LOCALES, filename);

    // Lê o arquivo template.json
    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

    // Lê o arquivo JSON específico
    const koData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const outDict = {};
    let isUpdated = false;

    for (const key in templateData) {
        if (koData.hasOwnProperty(key)) {
            outDict[key] = koData[key];
        } else {
            outDict[key] = templateData[key];
            isUpdated = true;
        }
    }

    // Verifica se houve alguma atualização necessária
    if (isUpdated) {
        console.log(`${BRIGHT_GREEN}Updating ${filename}${RESET}`);
        fs.writeFileSync(filePath, JSON.stringify(outDict, null, 2), 'utf8');
    } else {
        console.log(`${BRIGHT_GRAY}Skipping ${filename}: already synchronized${RESET}`);
    }
}

// Função principal
(function main() {
    const files = fs.readdirSync(DIR_LOCALES);
    console.log(`${BRIGHT_BLUE}Starting Sync Locales...${RESET}`);
    console.log(`${BRIGHT_BLUE}Searching for files in ${DIR_LOCALES}${RESET}`);
    console.log(`${BRIGHT_BLUE}Found ${files.length} files in ${DIR_LOCALES}${RESET}`);

    files.forEach((filename) => {
        if (filename.endsWith('.json') && filename !== 'template.json' && filename !== 'meta.json') {
            update(filename);
        }
    });
})();
