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
      // Note: WebSocket connection to telnet servers requires a proxy
      // For direct telnet connections, you would need a backend proxy server
      const wsUrl = `ws://${this.serverAddress}:${this.serverPort}`;
      
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
        this.handleServerMessage(event.data);
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
      this.appendMessage(cleanedData, 'server-response');
    }
  }
  
  cleanTelnetData(data) {
    // Remove Telnet control codes if present
    if (typeof data === 'string') {
      return data.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                 .replace(/\u001b\[[0-9;]*m/g, '') // Remove ANSI color codes
                 .trim();
    }
    return String(data).trim();
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
