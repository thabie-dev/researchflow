// Runs in its own process: word-extractor interferes with pdf-parse when both are loaded together.
const WordExtractor = require('word-extractor');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    const doc = await new WordExtractor().extract(Buffer.concat(chunks));
    process.stdout.write(doc.getBody());
  } catch (err) {
    process.stderr.write(err.message);
    process.exit(1);
  }
});
