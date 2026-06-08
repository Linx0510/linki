#!/bin/bash

# 1. Обновление системы
sudo apt update && sudo apt upgrade -y

# 2. Установка Node.js (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Установка PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your_secure_password';"
sudo -u postgres createdb ludo_db

# 4. Установка Nginx и Certbot (для SSL)
sudo apt install -y nginx certbot python3-certbot-nginx

# 5. Настройка Nginx
cat <<EOF | sudo tee /etc/nginx/sites-available/bicepscoin.net
server {
    server_name bicepscoin.net www.bicepscoin.net;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/bicepscoin.net /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# 6. Установка PM2 для автозапуска сервера
sudo npm install -g pm2
# pm2 start server.js --name "ludo-app"

echo "✅ Сервер настроен! Теперь залейте файлы, настройте .env и запустите: pm2 start server.js"
