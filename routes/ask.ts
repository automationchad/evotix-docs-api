import { Hono } from 'hono';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { OpenAIEmbeddings } from '@langchain/openai';
import { OpenAI } from '@langchain/openai';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { SupabaseHybridSearch } from '@langchain/community/retrievers/supabase';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

const vector = false;

config();

const ask = new Hono();

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_KEY
);

const PROMPT_TEMPLATE = `You are a helpful RFP assistant Tracy and you work for SAI360 (an EHS software company). Given the following conversation and a follow up question, return the conversation history excerpt that includes any relevant context to the question if it exists and rephrase the follow up question to be a standalone question.
Chat History: {chat_history}
Follow Up Input: {question}
Your answer should follow the following format:

\`\`\`
Use the following pieces of context to answer the user's question. Don't worry about any URLs included, you're not expected to retrieve information from them. Your answer should be concise and to the point (no longer than 25 words), the general structure of your answer should be: Yes/No/Yes with configuration/Yes with customization/Yes with partner solution followed by a more descriptive version of the answer. No need to provide more information than is necessary. Be blunt and spartan. No need to say "based on the information you provided" or anything like that. Just give the answer. If no context is provided and you don't know the answer, just say that you don't know, don't try to make up an answer. 
----------------
<Relevant chat history excerpt as context here>

Standalone question: <Rephrased question here>

Answer: <Your concise answer here>
\`\`\``;

let embeddings, vectorStore, fasterModel, slowerModel, chain;

const initResources = async () => {
	if (!embeddings) {
		embeddings = new OpenAIEmbeddings({
			openAIApiKey: process.env.OPENAI_API_KEY,
		});

		vectorStore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
			client: supabase,
			tableName: 'documents',
			queryName: 'match_documents',
		});

		fasterModel = new OpenAI({
			modelName: 'gpt-4o',
			temperature: 0.7,
		});

		slowerModel = new OpenAI({
			modelName: 'gpt-4o',
			temperature: 0.1,
		});

		const retriever = vector ? vectorStore.asRetriever() : new SupabaseHybridSearch(embeddings, {
			client: supabase,
			similarityK: 1,
			keywordK: 1,
			tableName: 'documents',
			similarityQueryName: 'match_documents',
			keywordQueryName: 'kw_match_documents',
		});

		chain = ConversationalRetrievalQAChain.fromLLM(slowerModel, retriever, {
			returnSourceDocuments: true,
			questionGeneratorChainOptions: {
				template: PROMPT_TEMPLATE,
				llm: fasterModel,
			},
		});
	}
};

ask.get('/', async (c) => {
	try {
		await initResources();
		const question = c.req.query('question');
		if (!question) {
			return c.json({ error: 'Question query parameter is required' }, 400);
		}

		const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

		const res = await chain.call({
			question: sanitizedQuestion,
			chat_history: [],
		});

		if (res.text.includes("I don't know.")) {
			return c.json({ answer: null }, 200);
		}

		return c.json({ answer: res.text }, 200);
	} catch (error) {
		console.error(error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default ask;
