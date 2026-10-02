import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';

import { closeServer } from '../../../src/lib/shutdown.ts';

type RunningServer = { server: Server; port: number };

async function listen(): Promise<RunningServer> {
  const server = createServer((_req, res) => {
    res.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected an inet socket address');
  }

  return { server, port: address.port };
}

async function openConnection(port: number): Promise<Socket> {
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  return socket;
}

describe('closeServer', () => {
  it('stops the server accepting connections', async () => {
    const { server, port } = await listen();

    await closeServer(server);

    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it('awaits onClose before resolving', async () => {
    const { server } = await listen();
    const order: string[] = [];

    await closeServer(server, {
      onClose: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('onClose');
      },
    });

    expect(order).toEqual(['onClose']);
    expect(server.listening).toBe(false);
  });

  it('destroys a connection still open when the timeout elapses', async () => {
    const { server, port } = await listen();
    const socket = await openConnection(port);
    const clientSawClose = once(socket, 'close');

    await closeServer(server, { timeoutMs: 20 });
    await clientSawClose;

    expect(socket.destroyed).toBe(true);
  });

  it('reports whether the close was forced', async () => {
    const { server, port } = await listen();
    const socket = await openConnection(port);
    const clientSawClose = once(socket, 'close');
    const messages: string[] = [];

    await closeServer(server, { timeoutMs: 20, log: (message) => messages.push(message) });
    await clientSawClose;

    expect(messages).toContain('graceful shutdown timed out; forcing close');
    expect(messages).toContain('http server closed');
  });

  it('does not force a close when every connection has already gone', async () => {
    const { server } = await listen();
    const messages: string[] = [];

    await closeServer(server, { timeoutMs: 20, log: (message) => messages.push(message) });

    expect(messages).not.toContain('graceful shutdown timed out; forcing close');
  });
});