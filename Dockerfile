FROM ghcr.io/puppeteer/puppeteer:22.12.1

# Cambiamos al usuario root para crear directorios sin problemas de permisos
USER root

WORKDIR /app

# Copiamos las dependencias
COPY package*.json ./

# Instalamos todo
RUN npm install

# Copiamos el resto del código
COPY . .

# Comando de arranque
CMD ["node", "index.js"]
