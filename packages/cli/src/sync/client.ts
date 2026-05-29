import { readFile } from "node:fs/promises";
import path from "node:path";

// --- Remote response shapes (subset of the v1 API) ---

export interface RecapImage {
  id: string;
  url: string;
  filename: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface UploadResult {
  imageId: string;
  url: string;
  filename: string;
}

export interface SyncStats {
  chapters: { created: number; updated: number; deleted: number };
  articles: { created: number; updated: number; deleted: number };
}

export interface RemoteArticleSummary {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  slug: string;
  language: string;
  status: string;
  order: number;
}

export interface RemoteChapter {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  slug: string;
  group?: string | null;
  order: number;
  translations?: Record<string, { title?: string; group?: string; description?: string }> | null;
  articles: RemoteArticleSummary[];
}

export interface RemoteProject {
  id: string;
  name: string;
  slug: string;
  subtitle: string;
  // Nullable on a freshly-created project — callers MUST guard against null.
  translations: Record<string, { name?: string; subtitle?: string }> | null;
  is_public: boolean;
  chapters: RemoteChapter[];
}

export interface RemoteArticle {
  slug: string;
  language: string;
  title: string;
  description?: string;
  keywords?: string[];
  content_json?: unknown;
  content_text?: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class RecapClient {
  private readonly apiBase: string;
  private readonly apiKey: string;

  constructor(opts: ClientOptions) {
    this.apiBase = opts.baseUrl.replace(/\/+$/, "") + "/api/v1";
    this.apiKey = opts.apiKey;
  }

  getProject(slug: string): Promise<RemoteProject> {
    return this.request<RemoteProject>("GET", `/projects/${slug}`);
  }

  async getArticle(slug: string, articleSlug: string, lang: string): Promise<RemoteArticle | null> {
    try {
      return await this.request<RemoteArticle>(
        "GET",
        `/projects/${slug}/articles/${encodeURIComponent(articleSlug)}?lang=${encodeURIComponent(lang)}`,
      );
    } catch {
      return null;
    }
  }

  listImages(slug: string): Promise<{ images: RecapImage[] }> {
    return this.request<{ images: RecapImage[] }>("GET", `/projects/${slug}/media/images`);
  }

  patchImage(
    slug: string,
    imageId: string,
    body: { width?: number; height?: number; alt_text?: string },
  ): Promise<RecapImage> {
    return this.request<RecapImage>("PATCH", `/projects/${slug}/media/images/${imageId}`, body);
  }

  sync(slug: string, payload: unknown): Promise<SyncStats> {
    return this.request<SyncStats>("PUT", `/projects/${slug}/sync`, payload);
  }

  async uploadImage(slug: string, filepath: string): Promise<UploadResult> {
    const buf = await readFile(filepath);
    const name = path.basename(filepath);
    const ext = path.extname(name).toLowerCase();
    const type = CONTENT_TYPES[ext] ?? "application/octet-stream";

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type }), name);

    const res = await fetch(`${this.apiBase}/projects/${slug}/media/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    const result = await this.handle<UploadResult | { images: UploadResult[] }>(
      res,
      "POST",
      `/projects/${slug}/media/images`,
    );
    // A single-file upload returns the bare object; tolerate the multi shape too.
    if (result && typeof result === "object" && "images" in result && Array.isArray(result.images)) {
      const first = result.images[0];
      if (!first) throw new Error(`Upload of ${name} returned no image`);
      return first;
    }
    return result as UploadResult;
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiBase}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.handle<T>(res, method, endpoint);
  }

  private async handle<T>(res: Response, method: string, endpoint: string): Promise<T> {
    if (!res.ok) {
      let detail = "";
      try {
        const json = (await res.json()) as { error?: string; code?: string };
        detail = json?.error
          ? `${json.error}${json.code ? ` (${json.code})` : ""}`
          : JSON.stringify(json);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new Error(`API ${res.status} on ${method} ${endpoint}: ${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
