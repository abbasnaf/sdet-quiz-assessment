import { GenericContainer, type StartedTestContainer } from "testcontainers";

export type StartedRedis = {
  url: string;
  container: StartedTestContainer;
  stop: () => Promise<void>;
};

export async function startRedisContainer(): Promise<StartedRedis> {
  const container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
  const host = container.getHost();
  const port = container.getMappedPort(6379);

  return {
    url: `redis://${host}:${port}`,
    container,
    stop: async () => {
      await container.stop();
    }
  };
}
