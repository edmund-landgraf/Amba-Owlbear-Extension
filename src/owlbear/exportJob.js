const STATES = new Set(["queued", "leased", "running", "succeeded", "failed", "dead"]);

export function createExportJobStore({ now = () => Date.now(), leaseMs = 30_000, maxAttempts = 3 } = {}) {
  const jobs = new Map();

  function scoped(job, roomId, userId) {
    return job.roomId === roomId && job.userId === userId;
  }

  return {
    enqueue({ idempotencyKey, roomId, userId, payload }) {
      if (!idempotencyKey || !roomId || !userId) throw new Error("Jobs require an idempotency key, room, and user.");
      const existing = [...jobs.values()].find(
        (job) => job.idempotencyKey === idempotencyKey && scoped(job, roomId, userId)
      );
      if (existing) return existing;
      const job = {
        id: idempotencyKey,
        idempotencyKey,
        roomId,
        userId,
        payload,
        state: "queued",
        attempts: 0,
        leaseOwner: null,
        leaseUntil: 0,
        lastError: null,
      };
      jobs.set(job.id, job);
      return job;
    },

    lease({ roomId, userId, owner }) {
      const nowMs = now();
      const job = [...jobs.values()].find((candidate) => {
        if (!scoped(candidate, roomId, userId)) return false;
        if (candidate.state === "queued" || candidate.state === "failed") return true;
        return candidate.state === "leased" && candidate.leaseUntil <= nowMs;
      });
      if (!job) return null;
      job.state = "leased";
      job.leaseOwner = owner;
      job.leaseUntil = nowMs + leaseMs;
      job.attempts += 1;
      return job;
    },

    markRunning(jobId, owner) {
      const job = jobs.get(jobId);
      if (!job || job.leaseOwner !== owner || job.state !== "leased") throw new Error("Lease is not held.");
      job.state = "running";
      return job;
    },

    succeed(jobId, owner) {
      const job = jobs.get(jobId);
      if (!job || job.leaseOwner !== owner) throw new Error("Lease is not held.");
      job.state = "succeeded";
      job.leaseOwner = null;
      return job;
    },

    fail(jobId, owner, error) {
      const job = jobs.get(jobId);
      if (!job || job.leaseOwner !== owner) throw new Error("Lease is not held.");
      job.lastError = String(error?.message ?? error);
      job.leaseOwner = null;
      job.state = job.attempts >= maxAttempts ? "dead" : "failed";
      return job;
    },

    get(jobId) {
      const job = jobs.get(jobId);
      if (!job || !STATES.has(job.state)) return null;
      return job;
    },
  };
}
