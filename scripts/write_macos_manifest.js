'use strict';
const fs = require('node:fs');const path = require('node:path');const {createHash} = require('node:crypto');
module.exports = async directory => {
  const version = require('../package.json').version;
  const names = fs.readdirSync(directory).filter(name => name.startsWith(`vxchat_${version}_macos_`) && /_(?:arm64|x64)\.(?:zip|dmg)$/.test(name));
  const files = [];
  for (const name of names) {
    const file = path.join(directory,name);const hash = createHash('sha512');for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    files.push({url:name,sha512:hash.digest('base64'),size:fs.statSync(file).size});
  }
  const primary = files.find(file => /_x64\.zip$/.test(file.url)) || files.find(file => file.url.endsWith('.zip'));
  if (!primary) throw new Error('No updater ZIP produced');
  const yaml = require('js-yaml').dump({version,files,path:primary.url,sha512:primary.sha512,releaseDate:new Date().toISOString()},{lineWidth:-1});
  fs.writeFileSync(path.join(directory,'latest-mac.yml'),yaml);
};
if (require.main === module) module.exports(path.resolve(process.argv[2] || 'dist')).catch(error => {console.error(error.message);process.exitCode = 1;});
