import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "./client-type";

const LOCAL_URL = "http://127.0.0.1:54321";
const ANON_KEY = "sb_publishable_local_anon_key";

type ClientModule = typeof import("./client");

/** Fresh module instance so the memoised browser client cannot leak across tests. */
async function loadClient(): Promise<ClientModule> {
  vi.resetModules();
  return import("./client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readSupabaseConfig", () => {
  it("returns null while nothing is configured", async () => {
    const { readSupabaseConfig } = await loadClient();
    expect(readSupabaseConfig()).toBeNull();
  });

  it("needs both the url and the anon key", async () => {
    const { readSupabaseConfig } = await loadClient();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    expect(readSupabaseConfig()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
    expect(readSupabaseConfig()).toBeNull();
  });

  it("returns both values, trimmed", async () => {
    const { readSupabaseConfig } = await loadClient();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `  ${LOCAL_URL}  `);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ` ${ANON_KEY} `);

    expect(readSupabaseConfig()).toEqual({ url: LOCAL_URL, anonKey: ANON_KEY });
  });

  it("accepts the publishable key name and prefers it over the anon name", async () => {
    const { readSupabaseConfig } = await loadClient();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ` ${ANON_KEY} `);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "stale_jwt_value");

    expect(readSupabaseConfig()).toEqual({ url: LOCAL_URL, anonKey: ANON_KEY });
  });

  it("works with only the publishable key set", async () => {
    const { readSupabaseConfig } = await loadClient();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ANON_KEY);

    expect(readSupabaseConfig()).toEqual({ url: LOCAL_URL, anonKey: ANON_KEY });
  });
});

describe("isSupabaseConfigured", () => {
  it("tracks the environment", async () => {
    const { isSupabaseConfigured } = await loadClient();
    expect(isSupabaseConfigured()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("isLocalSupabaseUrl", () => {
  it("accepts loopback hosts", async () => {
    const { isLocalSupabaseUrl } = await loadClient();
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://[::1]:54321")).toBe(true);
  });

  it("rejects anything hosted", async () => {
    const { isLocalSupabaseUrl } = await loadClient();
    expect(isLocalSupabaseUrl("https://abcdefghijklmnop.supabase.co")).toBe(
      false,
    );
    expect(isLocalSupabaseUrl("https://127.0.0.1.evil.example")).toBe(false);
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
  });
});

describe("getSupabaseBrowserClient", () => {
  it("stays null until Supabase is configured", async () => {
    const { getSupabaseBrowserClient } = await loadClient();
    expect(getSupabaseBrowserClient()).toBeNull();
  });

  it("is memoised once configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);

    const { getSupabaseBrowserClient } = await loadClient();
    const first = getSupabaseBrowserClient();
    expect(first).not.toBeNull();
    expect(getSupabaseBrowserClient()).toBe(first);
  });
});

describe("createSupabaseServerClient", () => {
  it("stays null until Supabase is configured", async () => {
    const { createSupabaseServerClient } = await loadClient();
    expect(createSupabaseServerClient()).toBeNull();
  });

  it("creates a fresh client each call", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);

    const { createSupabaseServerClient } = await loadClient();
    expect(createSupabaseServerClient()).not.toBe(
      createSupabaseServerClient(),
    );
  });

  it("forwards the caller session to PostgREST for RLS checks", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSupabaseServerClient } = await loadClient();
    const client = createSupabaseServerClient("caller-access-token");
    expect(client).not.toBeNull();
    await client!.from("tenancies").select("id").limit(1);

    const request = requests[0]?.init;
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer caller-access-token",
    );
  });
});

describe("the repository client type", () => {
  it("accepts the browser client returned by the module", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);

    const { getSupabaseBrowserClient } = await loadClient();
    const client: DbClient | null = getSupabaseBrowserClient();
    expect(client).not.toBeNull();
  });
});
