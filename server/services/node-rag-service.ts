import pgvector from 'pgvector';
import OpenAI from 'openai';
import { pool } from '../db';
import { aiCredentialsService } from './ai-credentials-service';
import { NodeKnowledgeBase, type NodeFunction } from './ai-flow-node-knowledge';
import { logger } from '../utils/logger';

const BATCH_SIZE = 20;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

class NodeRAGService {
  private buildChunkText(nodeType: string, node: NodeFunction): string {
    const requiredParams = node.parameters
      .filter(p => p.required)
      .map(p => p.name)
      .join(', ');
    return `${node.name}: ${node.description}. Use cases: ${node.useCases.join(', ')}. Required params: ${requiredParams}. Category: ${node.category}.`;
  }

  private async getOpenAIClient(companyId: number): Promise<OpenAI> {
    const credential = companyId === 0
      ? await aiCredentialsService.getSystemOrEnvCredential('openai')
      : await aiCredentialsService.getCredentialForCompany(companyId, 'openai');
    const apiKey = credential?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenAI API key not configured. Set OPENAI_API_KEY or configure OpenAI credentials in AI settings.'
      );
    }
    return new OpenAI({ apiKey });
  }

  /**
   * Initializes node type embeddings for RAG retrieval.
   *
   * On normal startup, only embeds node types that are not yet present in the
   * database. Pass `forceReEmbed: true` after updating node definitions in
   * ai-flow-node-knowledge.ts (descriptions, use cases, etc.) to refresh all
   * embeddings via ON CONFLICT DO UPDATE.
   */
  async initializeEmbeddings(companyId: number, forceReEmbed: boolean = false): Promise<void> {
    const knowledgeBase = NodeKnowledgeBase.getInstance();
    await knowledgeBase.initializeNodeKnowledge();

    let typesToProcess: string[];

    if (forceReEmbed) {
      typesToProcess = knowledgeBase.getAllNodeTypes();
    } else {
      const readClient = await pool.connect();
      try {
        const existingResult = await readClient.query<{ node_type: string }>(
          'SELECT node_type FROM node_embeddings'
        );
        const embeddedTypes = new Set(existingResult.rows.map(row => row.node_type));
        typesToProcess = knowledgeBase
          .getAllNodeTypes()
          .filter(nodeType => !embeddedTypes.has(nodeType));
      } finally {
        readClient.release();
      }
    }

    if (typesToProcess.length === 0) {
      logger.info('NodeRAGService', 'All node types already embedded, skipping initialization');
      return;
    }

    const openai = await this.getOpenAIClient(companyId);
    let embeddedCount = 0;

    for (let offset = 0; offset < typesToProcess.length; offset += BATCH_SIZE) {
      const batchTypes = typesToProcess.slice(offset, offset + BATCH_SIZE);
      const batchEntries: { nodeType: string; node: NodeFunction; chunkText: string }[] = [];

      for (const nodeType of batchTypes) {
        const node = knowledgeBase.getNodeFunction(nodeType);
        if (!node) continue;
        batchEntries.push({
          nodeType,
          node,
          chunkText: this.buildChunkText(nodeType, node),
        });
      }

      if (batchEntries.length === 0) continue;

      const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batchEntries.map(entry => entry.chunkText),
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const writeClient = await pool.connect();
      try {
        await writeClient.query('BEGIN');

        const valuesClauses: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        for (let i = 0; i < batchEntries.length; i++) {
          const { nodeType, node, chunkText } = batchEntries[i];
          const embedding = embeddingResponse.data[i]?.embedding;
          if (!embedding) continue;

          const metadata = {
            nodeType,
            category: node.category,
            name: node.name,
          };

          valuesClauses.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}::vector, $${paramIndex + 3}::jsonb, NOW())`
          );
          params.push(nodeType, chunkText, pgvector.toSql(embedding), JSON.stringify(metadata));
          paramIndex += 4;
        }

        if (valuesClauses.length > 0) {
          await writeClient.query(
            `INSERT INTO node_embeddings (node_type, chunk_text, embedding, metadata, updated_at)
             VALUES ${valuesClauses.join(', ')}
             ON CONFLICT (node_type) DO UPDATE SET
               chunk_text = EXCLUDED.chunk_text,
               embedding = EXCLUDED.embedding,
               updated_at = NOW()`,
            params
          );
          embeddedCount += valuesClauses.length;
        }

        await writeClient.query('COMMIT');
      } catch (error) {
        try {
          await writeClient.query('ROLLBACK');
        } catch {
          // ignore rollback errors
        }
        throw error;
      } finally {
        writeClient.release();
      }
    }

    logger.info('NodeRAGService', `Successfully embedded ${embeddedCount} node types`);
  }

  async retrieveRelevantNodes(
    query: string,
    topK: number,
    companyId: number,
    similarityThreshold: number = 0.3
  ): Promise<NodeFunction[]> {
    const openai = await this.getOpenAIClient(companyId);

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [query],
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const queryEmbedding = embeddingResponse.data[0]?.embedding;
    if (!queryEmbedding) {
      return [];
    }

    const client = await pool.connect();
    try {
      const result = await client.query<{ node_type: string; similarity: number }>(
        `SELECT node_type, 1 - (embedding <=> $1::vector) AS similarity
         FROM node_embeddings
         WHERE 1 - (embedding <=> $1::vector) >= $3
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [pgvector.toSql(queryEmbedding), topK, similarityThreshold]
      );

      const knowledgeBase = NodeKnowledgeBase.getInstance();
      return result.rows
        .map(row => knowledgeBase.getNodeFunction(row.node_type))
        .filter((node): node is NodeFunction => node !== null);
    } finally {
      client.release();
    }
  }

  getNodeSchema(nodeType: string): NodeFunction | null {
    return NodeKnowledgeBase.getInstance().getNodeFunction(nodeType);
  }
}

export const nodeRagService = new NodeRAGService();
