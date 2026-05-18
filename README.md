# Meridian

**Ask anything about a video. Get the exact moment that answers you.**

Meridian is a multimodal video intelligence system. Upload a video, and you can ask any natural language question about it. The system returns a precise timestamped answer by searching three independent knowledge channels simultaneously: spoken audio, on-screen text, and visual scene context.

Most video search tools only search transcripts. Meridian finds what was said, what was written on screen, and what was physically happening, then uses an AI agent to reason across all three before answering.

---

## Live Demo

[https://video-rag-rose.vercel.app](https://video-rag-rose.vercel.app)

---

## How It Works

### Upload and Processing

When a video is uploaded, two background jobs run in parallel on a Railway Python server, orchestrated by Inngest.

**Job 1: Audio transcription**
faster-whisper runs locally on the Railway server and produces a verbatim transcript with word-level timestamps. The transcript is grouped into overlapping sentence chunks, each embedded via the Gemini embedding API and stored in Pinecone. Raw chunks are also written to Postgres.

**Job 2: Frame analysis**
ffmpeg extracts one frame per second. Each frame is sent to Gemini 3 Flash, which returns both the on-screen text (OCR) and a natural language scene description in a single call. Results are written to Postgres.

When both jobs complete, the video status is set to READY and the user is automatically navigated to the query interface.

### Agentic Query

Every user question goes through an agentic reasoning loop running inside a Next.js API route on Vercel.

The agent has three tools:

- `search_transcript` — semantic vector search over spoken audio chunks via Pinecone
- `search_ocr` — full-text search over on-screen text via Postgres tsvector
- `search_scene` — semantic vector search over visual scene descriptions via Pinecone

The agent calls all three tools, reflects on what comes back, reformulates queries if results are thin, and keeps searching until it has enough evidence. It runs up to six iterations before synthesizing a final answer. The answer includes the best timestamp, a full explanation, and reference cards showing which channel produced the strongest signal.

Results stream to the frontend in real time. The video player seeks to the returned timestamp automatically.

---

## Tech Stack

| Layer | Technology                                    |
|---|-----------------------------------------------|
| Frontend and API | Next.js on Vercel                             |
| Styling | Tailwind CSS                                  |
| Auth | BetterAuth                                    |
| Background jobs | Inngest                                       |
| Processing server | Python on Railway                             |
| ASR | faster-whisper (tiny, CPU, int8)              |
| Frame extraction | ffmpeg-python                                 |
| Visual analysis | Gemini 3 Flash (OCR + scene per frame)        |
| Agent LLM | Gemini 2.5 Pro with extended thinking         |
| Embeddings | Gemini Embedding 002                          |
| Vector store | Pinecone (two namespaces: transcript, scenes) |
| Relational DB | Neon Postgres                                 |
| ORM | Drizzle ORM                                   |
| File storage | Vercel Blob                                   |

---

## Repository Structure

```
/
  app/                  Next.js App Router pages and API routes
    api/
      query/            Agentic query endpoint (streaming NDJSON)
      upload/           Upload initiation and Inngest event trigger
      suggestions/      AI-generated question suggestions per video
      status/           Video processing status polling
      inngest/          Inngest webhook handler (Next.js side)
  components/           React components (query interface, video player, agent trace, reference cards)
  lib/                  Shared utilities (auth, db, genai client)

  python-server/        Railway Python server
    functions/
      extract.py        ffmpeg extraction (audio + frames)
      asr.py            faster-whisper transcription, chunking, embedding, Pinecone upsert
      visual.py         Gemini frame analysis (OCR + scene), Postgres writes
      complete.py       Final status update after both jobs complete
    lib/
      db.py             Postgres client and query helpers
      gemini_client.py  Gemini API wrapper (embed + analyze_frame)
      pinecone_client.py Pinecone upsert helper
      storage.py        Vercel Blob download helper
    main.py             FastAPI server entry point with Inngest functions registered
```

---

## Environment Variables

### Next.js (Vercel)

```
DATABASE_URL                      Neon Postgres connection string
BETTER_AUTH_SECRET                BetterAuth session secret
BLOB_READ_WRITE_TOKEN             Vercel Blob token
INNGEST_SIGNING_KEY               Inngest signing key
INNGEST_EVENT_KEY                 Inngest event key
PINECONE_API_KEY                  Pinecone API key
PINECONE_INDEX_NAME               Pinecone index name
GOOGLE_CLOUD_PROJECT              GCP project ID (for Vertex AI auth)
GOOGLE_CLOUD_SERVICE_ACCOUNT      GCP service account email
WORKLOAD_IDENTITY_POOL_ID         Workload Identity pool ID
WORKLOAD_IDENTITY_PROVIDER_ID     Workload Identity provider ID
```

### Python server (Railway)

```
DATABASE_URL                      Neon Postgres connection string
BLOB_READ_WRITE_TOKEN             Vercel Blob token
INNGEST_SIGNING_KEY               Inngest signing key
INNGEST_EVENT_KEY                 Inngest event key
PINECONE_API_KEY                  Pinecone API key
PINECONE_INDEX_NAME               Pinecone index name
GEMINI_API_KEY                    Gemini API key
```

---

## Local Development

### Next.js frontend

```bash
npm install
npm run dev
```

### Python server

```bash
cd python-server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Run the Inngest dev server alongside both:

```bash
npx inngest-cli@latest dev
```

---

## Key Design Decisions

**faster-whisper instead of Gemini for ASR.** Gemini is a generative model and hallucinates when transcribing audio. It paraphrases and subtly alters spoken words. For a knowledge base where exact spoken words matter, hallucinated transcriptions corrupt the store permanently. faster-whisper produces verbatim output without hallucination.

**Inngest for job orchestration.** Inngest provides step-level durability. If a Gemini API call fails on frame 47, the job retries from that frame, not from the beginning of the video. Building this manually would require Redis and Celery with significant operational overhead.

**Separate OCR and scene stores.** OCR gives the agent exact words visible on screen. Scene descriptions give the agent an understanding of physical activity and visual context. Keeping them separate lets the agent explain which source contributed most to any given answer.

**Timestamps never inside embeddings.** Timestamps embedded in text strings destroy semantic meaning in the vector space. A chunk about load balancers should be semantically close to other load balancer queries, not to queries containing similar numbers. Timestamps live only as metadata in Pinecone and as columns in Postgres.

---

## License

MIT
