import { v4 as uuidv4 } from 'uuid';

// Simple in-memory job queue and registry
// Job lifecycle: queued -> processing -> completed | failed
// This is ephemeral (resets on server restart). For durability, swap with Redis/Bull/etc.

const jobs = new Map(); // jobId -> job record
const queue = []; // FIFO of jobIds
let isProcessing = false;

const processors = new Map(); // type -> async (payload, ctx) => result

function nowIso() {
  return new Date().toISOString();
}

export function registerProcessor(type, fn) {
  processors.set(type, fn);
}

export function createJob(type, payload) {
  const id = uuidv4();
  const job = {
    id,
    type,
    status: 'queued',
    progress: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    payload, // keep in memory; consider temp files for large payloads
    result: null,
    error: null,
  };
  jobs.set(id, job);
  queue.push(id);
  scheduleProcess();
  return job;
}

export function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function scheduleProcess() {
  if (!isProcessing) {
    // Yield to event loop to keep server responsive
    setImmediate(processNext);
  }
}

async function processNext() {
  if (isProcessing) return;
  const nextId = queue.shift();
  if (!nextId) return; // nothing to do

  const job = jobs.get(nextId);
  if (!job) return processNext();

  const processor = processors.get(job.type);
  if (!processor) {
    job.status = 'failed';
    job.error = `No processor registered for job type: ${job.type}`;
    job.updatedAt = nowIso();
    return processNext();
  }

  isProcessing = true;
  job.status = 'processing';
  job.updatedAt = nowIso();

  const ctx = {
    reportProgress: (value) => {
      job.progress = Math.max(0, Math.min(100, Number(value) || 0));
      job.updatedAt = nowIso();
    }
  };

  try {
    const result = await processor(job.payload, ctx);
    job.result = result;
    job.status = 'completed';
    job.progress = 100;
    job.updatedAt = nowIso();
  } catch (err) {
    job.status = 'failed';
    job.error = err?.message || String(err);
    job.updatedAt = nowIso();
  } finally {
    isProcessing = false;
    // Free up payload memory after completion to reduce footprint
    if (job.status === 'completed' || job.status === 'failed') {
      try { delete job.payload; } catch {}
    }
    // Schedule next job
    setImmediate(processNext);
  }
}