import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');

    const cacheDir = path.join(os.homedir(), '.cache', 'huggingface');
    const modelCached = fs.existsSync(path.join(cacheDir, 'Xenova--all-MiniLM-L6-v2'));

    if (!modelCached) {
      process.stderr.write(
        'Downloading embedding model (all-MiniLM-L6-v2, ~23MB, one-time only)...\n',
      );
    }

    extractor = await pipeline('feature-extraction', MODEL_NAME, {
      quantized: true,
    });

    if (!modelCached) {
      process.stderr.write('Model ready.\n');
    }
  }
  return extractor;
}

/**
 * Generate a normalized embedding vector from text.
 * Uses all-MiniLM-L6-v2 (384 dimensions) running locally via ONNX.
 * The model (~23MB) is downloaded and cached on first use.
 *
 * For text longer than the model's 256-token limit, we split into chunks,
 * embed each, and mean-pool the results.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const ext = await getExtractor();

  const trimmed = text.trim();
  if (!trimmed) {
    return new Array<number>(EMBEDDING_DIM).fill(0);
  }

  // Split into chunks of ~200 words to stay within token limit
  const chunks = chunkText(trimmed, 200);

  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    const output = await ext(chunk, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));
  }

  if (embeddings.length === 1) {
    return embeddings[0];
  }

  // Mean-pool all chunk embeddings
  const pooled = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      pooled[i] += emb[i];
    }
  }

  // Normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    pooled[i] /= embeddings.length;
    norm += pooled[i] * pooled[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      pooled[i] /= norm;
    }
  }

  return pooled;
}

function chunkText(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks;
}
