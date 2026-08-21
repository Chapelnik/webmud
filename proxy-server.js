import { WebSocketServer } from 'ws';
import net from 'net';
import http from 'http';
import url from 'url';

const PORT = process.env.PROXY_PORT || 8080;

// Хранилище активных соединений: WebSocket -> Telnet Socket
const connections = new Map();

const server = http.createServer((req, res) => {
  // Прокси только для WebSocket соединений
  res.writeHead(404);
  res.end('WebSocket proxy server. Connect via WebSocket.');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  
  // Получаем адрес и порт целевого сервера из query параметров
  const targetHost = parsedUrl.query.host;
  const targetPort = parseInt(parsedUrl.query.port, 10);

  if (!targetHost || !targetPort || isNaN(targetPort)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    console.log(`❌ Отклонено: не указаны host или port`);
    return;
  }

  console.log(`🔌 Подключение к ${targetHost}:${targetPort}...`);

  // Создаем TCP соединение с MUD сервером
  const telnetSocket = net.createConnection({
    host: targetHost,
    port: targetPort
  }, () => {
    console.log(`✅ Подключено к ${targetHost}:${targetPort}`);
  });

  // Обработка данных от MUD сервера -> отправка клиенту
  telnetSocket.on('data', (data) => {
    const ws = Array.from(connections.entries()).find(([_, sock]) => sock === telnetSocket)?.[0];
    if (ws && ws.readyState === ws.OPEN) {
      // Конвертируем буфер в строку и отправляем клиенту
      ws.send(data.toString('utf8'));
    }
  });

  // Обработка ошибок Telnet соединения
  telnetSocket.on('error', (err) => {
    console.error(`❌ Ошибка Telnet: ${err.message}`);
    const ws = Array.from(connections.entries()).find(([_, sock]) => sock === telnetSocket)?.[0];
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    }
    connections.delete(ws);
  });

  // Обработка закрытия Telnet соединения
  telnetSocket.on('close', () => {
    console.log(`🔌 Соединение с ${targetHost}:${targetPort} закрыто`);
    const ws = Array.from(connections.entries()).find(([_, sock]) => sock === telnetSocket)?.[0];
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ closed: true }));
      ws.close();
    }
    connections.delete(ws);
  });

  // Апгрейд соединения до WebSocket
  wss.handleUpgrade(request, socket, head, (ws) => {
    // Сохраняем соединение
    connections.set(ws, telnetSocket);

    // Обработка данных от клиента -> отправка MUD серверу
    ws.on('message', (message) => {
      if (telnetSocket.readyState === 'open') {
        // Отправляем команду с переводом строки
        telnetSocket.write(message + '\n');
      }
    });

    // Обработка ошибок WebSocket
    ws.on('error', (err) => {
      console.error(`❌ Ошибка WebSocket: ${err.message}`);
      telnetSocket.destroy();
      connections.delete(ws);
    });

    // Обработка закрытия WebSocket
    ws.on('close', () => {
      console.log(`🔌 WebSocket соединение закрыто`);
      telnetSocket.destroy();
      connections.delete(ws);
    });

    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WebSocket-Telnet прокси запущен на порту ${PORT}`);
  console.log(`   Пример подключения: ws://localhost:${PORT}/?host=mud.example.com&port=4000`);
});

// Обработка завершения работы
process.on('SIGINT', () => {
  console.log('\n🛑 Закрытие всех соединений...');
  connections.forEach((telnetSocket, ws) => {
    telnetSocket.destroy();
    ws.close();
  });
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});
