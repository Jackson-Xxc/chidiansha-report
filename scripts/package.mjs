import {build} from 'esbuild';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
await copyFile('edgeone.json','dist/edgeone.json');
await mkdir('dist/cloud-functions/api',{recursive:true});
await build({entryPoints:['cloud-functions/api/[[path]].js'],outfile:'dist/cloud-functions/api/[[path]].js',bundle:true,format:'esm',platform:'node',target:'node20'});
await writeFile('dist/package.json',JSON.stringify({type:'module',private:true}));
console.log('Tencent EdgeOne deployment package ready: dist/');
