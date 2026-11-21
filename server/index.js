// 启动入口：npm start（或 node server/index.js）
import http from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

// 命令行参数：--data=<数据文件夹> --port=<端口>（可选，便于试用时用单独的数据）
const args = Object.fromEntries(process.argv.slice(2).map((a) => /^--(data|port)=(.+)$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2]]));
const config = loadConfig({ dataDir: args.data, port: args.port && Number(args.port) });
const { handler, ready } = createApp(config);
await ready;

const server = http.createServer(handler);
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${config.port} 被占用。可以关掉占用它的程序，或用 JZ_PORT=其他端口 再启动。`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
server.listen(config.port, config.host, () => {
  console.log(`建站助手已启动：http://127.0.0.1:${config.port}`);
  console.log(`数据位置：${config.dataDir}`);
  console.log(`可选的项目文件夹范围：${config.workspaceRoots.join('；')}`);
  console.log('按 Ctrl+C 停止。');
});
