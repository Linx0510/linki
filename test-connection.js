require('dotenv').config();
const queries = require('./db/queries');

async function testConnection() {
  console.log('🚀 Проверка подключения к базе данных Ludo...');
  
  try {
    // 1. Получаем список всех квестов
    const quests = await queries.getAllQuests();
    
    if (quests.length > 0) {
      console.log('✅ Подключение успешно! Список квестов:');
      quests.forEach(q => {
        console.log(` - [${q.difficulty}] ${q.name} (Эксперт: ${q.expert_name || 'Система'})`);
      });
    } else {
      console.log('⚠️ Подключено, но квесты не найдены. Проверьте выполнение Seed Data.');
    }

    // 2. Получаем данные пользователя Alex_Kostenko (ID: 1)
    const user = await queries.getUserById(1);
    if (user) {
      console.log(`✅ Данные игрока загружены: ${user.username}, Уровень: ${user.level}, XP: ${user.xp}`);
    }

  } catch (err) {
    console.error('❌ Ошибка подключения или запроса:');
    if (err.code === '28P01') {
      console.error('   Неверный пароль в файле .env!');
    } else if (err.code === '3D000') {
      console.error('   База данных ludo_db не найдена!');
    } else {
      console.error('  ', err.message);
    }
  } finally {
    // Закрываем пул, чтобы процесс завершился
    require('./db/pool').end();
  }
}

testConnection();
