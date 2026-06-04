# ⚽ Football Titles Server

Сервер для управления титрами футбольного матча с веб-интерфейсом. Подходит для использования с OBS Studio и vMix.

## 📋 Возможности

- 🏆 Управление счетом и названиями команд
- 🎨 Настройка цветов команд
- 🖼️ Загрузка логотипов команд (PNG, JPG, SVG)
- ⏱️ Настраиваемая продолжительность тайма (1-60 мин)
- ⏰ Добавленное время для каждого тайма (0-15 мин)
- 🎮 Полный контроль таймера (старт/стоп/сброс/смена тайма)
- 📋 События матча (голы, замены, желтые/красные карточки)
- 📜 История событий
- 🖼️ SVG табло с градиентом и логотипами
- 💬 Всплывающие титры с анимацией
- 🔄 Real-time обновление через WebSocket
- 📱 Адаптивный дизайн

## 🚀 Быстрый старт

### Установка

```bash
# Клонируйте репозиторий
git clone https://github.com/your-username/football-titles.git
cd football-titles

# Установите зависимости
npm install


Запуск
node server.js


Доступ
Панель управления: http://localhost:3000
Страница для OBS/vMix: http://localhost:3000/display

📁 Структура проекта
football-titles/
├── server.js              # Основной сервер
├── package.json           # Зависимости
├── README.md              # Документация
├── .gitignore             # Игнорируемые файлы
├── public/
│   ├── index.html         # Панель управления
│   ├── display.html       # Страница для OBS/vMix
│   ├── style.css          # Стили
│   ├── client.js          # Клиентский JavaScript
│   └── templates/         # SVG шаблоны
│       ├── scoreboard.svg
│       ├── goal.svg
│       ├── substitution.svg
│       ├── yellow-card.svg
│       ├── red-card.svg
│       └── logos/         # Папка для логотипов
│           └── placeholder.svg

🎨 Кастомизация
Редактирование шаблонов
Все SVG шаблоны находятся в папке public/templates/:

scoreboard.svg - табло

goal.svg - гол

substitution.svg - замена

yellow-card.svg - желтая карточка

red-card.svg - красная карточка

Доступные переменные для шаблонов:

Переменная	Описание
{{homeTeamName}}	Название домашней команды
{{awayTeamName}}	Название гостевой команды
{{homeTeamScore}}	Счет домашней команды
{{awayTeamScore}}	Счет гостевой команды
{{homeTeamColor}}	Цвет домашней команды
{{awayTeamColor}}	Цвет гостевой команды
{{homeTeamLogo}}	Логотип домашней команды (base64)
{{awayTeamLogo}}	Логотип гостевой команды (base64)
{{matchTime}}	Текущее время матча
{{additionalTimeText}}	Текст добавленного времени
{{halfText}}	Статус тайма
Настройка цветов
Цвета команд можно менять в панели управления через color picker. Они автоматически применяются к табло.

Загрузка логотипов
Нажмите "Выбрать логотип" в панели управления

Выберите файл (PNG, JPG, SVG)

Логотип автоматически отобразится на табло

🖥️ Использование с OBS Studio
Добавьте новый источник "Browser"

URL: http://localhost:3000/display

Ширина: 1920, Высота: 1080

Отметьте "Refresh browser when scene becomes active"

Нажмите OK

📦 Зависимости
Express - веб-фреймворк

Socket.IO - real-time коммуникация

Multer - загрузка файлов

🔧 Системные требования
Node.js 14+

Современный браузер (Chrome, Firefox, Edge)

Windows / macOS / Linux

📝 Лицензия
MIT License

👨‍💻 Автор
Ваше Имя

🤝 Поддержка
Если у вас возникли вопросы или предложения, создайте issue в репозитории.