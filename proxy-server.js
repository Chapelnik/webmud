import WebSocket from 'ws';
import net from 'net';
import http from 'http';
import crypto from 'crypto';

const PORT = process.env.PROXY_PORT || 8080;

// Хранилище активных соединений: WebSocket -> Telnet Socket
const connections = new Map();

const server = http.createServer((req, res) => {
  // Прокси только для WebSocket соединений
  res.writeHead(404);
  res.end('WebSocket proxy server. Connect via WebSocket.');
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  // Получаем адрес и порт целевого сервера из query параметров
  const targetHost = url.searchParams.get('host');
  const targetPort = parseInt(url.searchParams.get('port'), 10);

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

  // Создаем WebSocket для клиента
  const ws = new WebSocket(null, {
    noServer: true
  });

  // Обработка данных от MUD сервера -> отправка клиенту
  telnetSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      // Конвертируем буфер в строку и отправляем клиенту
      ws.send(data.toString('utf8'));
    }
  });

  // Обработка ошибок Telnet соединения
  telnetSocket.on('error', (err) => {
    console.error(`❌ Ошибка Telnet: ${err.message}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    }
    connections.delete(ws);
  });

  // Обработка закрытия Telnet соединения
  telnetSocket.on('close', () => {
    console.log(`🔌 Соединение с ${targetHost}:${targetPort} закрыто`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ closed: true }));
      ws.close();
    }
    connections.delete(ws);
  });

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

  // Завершаем апгрейд до WebSocket
  const key = request.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + accept
  ].join('\r\n') + '\r\n\r\n');
  
  // Эмитим событие подключения
  ws.emit('open');
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
