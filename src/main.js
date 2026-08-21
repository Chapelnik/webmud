// MUD Client - Main JavaScript File

class MUDClient {
  constructor() {
    this.socket = null;
    this.serverAddress = '';
    this.serverPort = '';
    this.isConnected = false;
    
    // DOM Elements
    this.modal = document.getElementById('connection-modal');
    this.connectionForm = document.getElementById('connection-form');
    this.serverAddressInput = document.getElementById('server-address');
    this.serverPortInput = document.getElementById('server-port');
    this.connectBtn = document.getElementById('connect-btn');
    this.gameOutput = document.getElementById('game-output');
    this.commandInput = document.getElementById('command-input');
    this.sendBtn = document.getElementById('send-btn');
    this.connectionStatus = document.getElementById('connection-status');
    this.reconnectBtn = document.getElementById('reconnect-btn');
    
    // Настройки прокси
    this.proxyHost = window.location.hostname;
    this.proxyPort = '8080';
    
    this.init();
  }
  
  init() {
    // Event Listeners
    this.connectionForm.addEventListener('submit', (e) => this.handleConnect(e));
    this.sendBtn.addEventListener('click', () => this.sendCommand());
    this.commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendCommand();
      }
    });
    this.reconnectBtn.addEventListener('click', () => this.showModal());
    
    // Focus on address input when modal opens
    this.serverAddressInput.focus();
  }
  
  showModal() {
    this.modal.style.display = 'flex';
    this.serverAddressInput.focus();
  }
  
  hideModal() {
    this.modal.style.display = 'none';
  }
  
  handleConnect(e) {
    e.preventDefault();
    
    this.serverAddress = this.serverAddressInput.value.trim();
    this.serverPort = this.serverPortInput.value.trim();
    
    if (!this.serverAddress || !this.serverPort) {
      this.appendMessage('Пожалуйста, введите адрес и порт сервера', 'error-message');
      return;
    }
    
    this.connectToServer();
  }
  
  connectToServer() {
    this.setConnectionStatus('connecting', 'Подключение...');
    this.connectBtn.disabled = true;
    this.connectBtn.textContent = 'Подключение...';
    
    try {
      // Подключение через WebSocket-Telnet прокси
      // Формируем URL для подключения к прокси с параметрами целевого сервера
      const wsUrl = `ws://${this.proxyHost}:${this.proxyPort}/?host=${encodeURIComponent(this.serverAddress)}&port=${encodeURIComponent(this.serverPort)}`;
      
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        this.isConnected = true;
        this.setConnectionStatus('connected', `Подключено к ${this.serverAddress}:${this.serverPort}`);
        this.hideModal();
        this.enableInput();
        this.appendMessage(`✓ Подключено к серверу ${this.serverAddress}:${this.serverPort}`, 'system-message');
        this.appendMessage('Добро пожаловать в MUD Client!', 'system-message');
      };
      
      this.socket.onmessage = (event) => {
        // Проверяем, не является ли сообщение JSON с ошибкой или статусом закрытия
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'error') {
            this.appendMessage(`✗ Ошибка сервера: ${data.message}`, 'error-message');
            return;
          }
          
          if (data.type === 'status') {
            this.appendMessage(`✓ ${data.message}`, 'system-message');
            return;
          }
          
          if (data.type === 'data' && data.payload) {
            // Декодируем Base64 в бинарные данные
            const binaryData = atob(data.payload);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }
            
            // Пробуем декодировать как CP1251 (Windows-1251) - наиболее частая кодировка для русскоязычных MUD
            // Если видите кракозябры, можно попробовать другую кодировку
            const text = this.decodeWindows1251(bytes);
            this.handleServerMessage(text);
            return;
          }
          
          // Если это обычный текст в JSON, используем его
          if (typeof data === 'string') {
            this.handleServerMessage(data);
          }
        } catch (e) {
          // Это не JSON, обрабатываем как обычный текст
          this.handleServerMessage(event.data);
        }
      };
      
      this.socket.onclose = (event) => {
        this.isConnected = false;
        this.disableInput();
        this.setConnectionStatus('disconnected', 'Отключено от сервера');
        this.reconnectBtn.style.display = 'inline-block';
        
        let reason = 'Неизвестная причина';
        if (event.code === 1000) reason = 'Нормальное закрытие';
        else if (event.code === 1001) reason = 'Сервер недоступен';
        else if (event.code === 1006) reason = 'Обрыв соединения';
        
        this.appendMessage(`✗ Отключено от сервера (${reason})`, 'error-message');
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.appendMessage('✗ Ошибка подключения к серверу', 'error-message');
        this.setConnectionStatus('disconnected', 'Ошибка подключения');
        this.connectBtn.disabled = false;
        this.connectBtn.textContent = 'Подключиться';
      };
      
    } catch (error) {
      console.error('Connection error:', error);
      this.appendMessage(`✗ Ошибка: ${error.message}`, 'error-message');
      this.setConnectionStatus('disconnected', 'Ошибка подключения');
      this.connectBtn.disabled = false;
      this.connectBtn.textContent = 'Подключиться';
    }
  }
  
  handleServerMessage(data) {
    // Clean and display the message from server
    const cleanedData = this.cleanTelnetData(data);
    if (cleanedData.trim()) {
      // Разбиваем на строки и отображаем каждую с сохранением форматирования
      const lines = cleanedData.split(/\r?\n/);
      lines.forEach(line => {
        // Создаем элемент для каждой строки, сохраняя пробелы
        const lineElement = document.createElement('div');
        lineElement.className = 'server-response';
        // Используем white-space: pre-wrap для сохранения форматирования
        lineElement.style.whiteSpace = 'pre-wrap';
        lineElement.textContent = line;
        this.gameOutput.appendChild(lineElement);
      });
    } else if (cleanedData === '') {
      // Пустая строка - добавляем разделитель
      const spacer = document.createElement('div');
      spacer.className = 'server-response';
      spacer.style.height = '4px';
      this.gameOutput.appendChild(spacer);
    }
  }
  
  cleanTelnetData(data) {
    // Удаляем только управляющие символы Telnet, но оставляем пробелы и переносы строк
    if (typeof data === 'string') {
      return data.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                 .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, ''); // Удаляем ANSI коды
    }
    return String(data);
  }
  
  /**
   * Декодирует байты в строку Windows-1251 (CP1251)
   */
  decodeWindows1251(bytes) {
    const win1251Map = {
      128: 'Ђ', 129: 'Ѓ', 130: '‚', 131: 'ѓ', 132: '„', 133: '…', 134: '†', 135: '‡',
      136: '€', 137: '‰', 138: 'Љ', 139: '‹', 140: 'Њ', 141: 'Ќ', 142: 'Ћ', 143: 'Џ',
      144: 'ђ', 145: '‘', 146: '’', 147: '"', 148: '"', 149: '•', 150: '–', 151: '—',
      152: '', 153: '™', 154: 'љ', 155: '›', 156: 'њ', 157: 'ќ', 158: 'ћ', 159: 'џ',
      160: ' ', 161: 'Ў', 162: 'ў', 163: 'Ј', 164: '¤', 165: 'Ґ', 166: '¦', 167: '§',
      168: 'Ё', 169: '©', 170: 'Є', 171: '«', 172: '¬', 173: '-', 174: '®', 175: 'Ї',
      176: '°', 177: '±', 178: 'І', 179: 'і', 180: 'ґ', 181: 'µ', 182: '¶', 183: '·',
      184: 'ё', 185: '№', 186: 'є', 187: '»', 188: 'ј', 189: 'Ѕ', 190: 'ѕ', 191: 'ї',
      192: 'А', 193: 'Б', 194: 'В', 195: 'Г', 196: 'Д', 197: 'Е', 198: 'Ж', 199: 'З',
      200: 'И', 201: 'Й', 202: 'К', 203: 'Л', 204: 'М', 205: 'Н', 206: 'О', 207: 'П',
      208: 'Р', 209: 'С', 210: 'Т', 211: 'У', 212: 'Ф', 213: 'Х', 214: 'Ц', 215: 'Ч',
      216: 'Ш', 217: 'Щ', 218: 'Ъ', 219: 'Ы', 220: 'Ь', 221: 'Э', 222: 'Ю', 223: 'Я',
      224: 'а', 225: 'б', 226: 'в', 227: 'г', 228: 'д', 229: 'е', 230: 'ж', 231: 'з',
      232: 'и', 233: 'й', 234: 'к', 235: 'л', 236: 'м', 237: 'н', 238: 'о', 239: 'п',
      240: 'р', 241: 'с', 242: 'т', 243: 'у', 244: 'ф', 245: 'х', 246: 'ц', 247: 'ч',
      248: 'ш', 249: 'щ', 250: 'ъ', 251: 'ы', 252: 'ь', 253: 'э', 254: 'ю', 255: 'я'
    };
    
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte < 128) {
        // ASCII символы
        result += String.fromCharCode(byte);
      } else if (win1251Map[byte]) {
        // Символы Windows-1251
        result += win1251Map[byte];
      } else {
        // Неизвестный символ - заменяем на '?'
        result += '?';
      }
    }
    return result;
  }
  
  sendCommand() {
    const command = this.commandInput.value.trim();
    
    if (!command || !this.isConnected) {
      return;
    }
    
    // Display the command in the output
    this.appendMessage(`> ${command}`, 'player-command');
    
    // Send to server
    try {
      this.socket.send(command + '\n');
    } catch (error) {
      console.error('Error sending command:', error);
      this.appendMessage('✗ Ошибка отправки команды', 'error-message');
    }
    
    // Clear input
    this.commandInput.value = '';
    this.commandInput.focus();
  }
  
  appendMessage(text, className = '') {
    const messageElement = document.createElement('div');
    messageElement.className = className;
    messageElement.textContent = text;
    this.gameOutput.appendChild(messageElement);
    
    // Auto-scroll to bottom
    this.gameOutput.scrollTop = this.gameOutput.scrollHeight;
  }
  
  setConnectionStatus(status, text) {
    this.connectionStatus.className = 'connection-status ' + status;
    this.connectionStatus.textContent = text;
  }
  
  enableInput() {
    this.commandInput.disabled = false;
    this.sendBtn.disabled = false;
    this.commandInput.focus();
  }
  
  disableInput() {
    this.commandInput.disabled = true;
    this.sendBtn.disabled = true;
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.mudClient = new MUDClient();
});
