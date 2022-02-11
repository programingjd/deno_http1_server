import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import {promises as fs} from 'fs';

const mimetype=(await import('../mimetype.schema.json',{assert:{type:'json'}})).default;
const mimes=(await import('../mimes.schema.json',{assert:{type:'json'}})).default;
const directory=(await import('../directory.schema.json',{assert:{type:'json'}})).default;


const ajv=new Ajv({
  schemas: [mimetype,mimes,directory],
  code: {
    source: true,
    esm: true,
    optimize: true
  },
  strictSchema: true,
  strictNumbers: true,
  strictTypes: true,
  strictTuples: true,
  strictRequired: true,
  allowMatchingProperties: true,
  allErrors: true,
  verbose: true
});
const code=standaloneCode(
  ajv,
  {
    validateMimeTypeConfig_: 'https://raw.githubusercontent.com/programingjd/deno_http1_server/main/mimetype.schema.json',
    validateMimeTypes_: 'https://raw.githubusercontent.com/programingjd/deno_http1_server/main/mimes.schema.json',
    validateDirectoryConfig_: 'https://raw.githubusercontent.com/programingjd/deno_http1_server/main/directory.schema.json',
  }
);

await fs.writeFile('validator.js',code);
