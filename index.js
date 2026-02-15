(function () {
    const extensionName = "style-generator";
    
    // ID твоих промптов из JSON (НЕ МЕНЯЙ, если не менял их в пресете)
    const WRITING_STYLE_ID = "5d917cfc-5200-4a6a-8729-035c7433bd0b"; // writing style
    const DIALOGUE_ID = "73c2e4f4-ca2f-482b-bf44-c7b53a7dedb6";      // dialogues

    // Шаблон для генератора (Мета-промпт)
    const GENERATOR_PROMPT = `
Ты опытный промпт-инженер для ролевых игр. Твоя задача — создать два системных промпта на основе запроса пользователя.
Запрос пользователя: "{{USER_REQUEST}}"

Тебе нужно сгенерировать два блока XML: <writing_style> и <dialogue>.
Соблюдай строгий формат.

ВОТ ПРИМЕР ТОГО, КАК ДОЛЖЕН ВЫГЛЯДЕТЬ РЕЗУЛЬТАТ (структура):
<writing_style>
Core principle: [Краткий принцип]
STRUCTURE:
- [Правила структуры предложений]
RHYTHM:
- [Правила ритма текста]
DETAIL SELECTION:
- [На чем фокусироваться]
BANNED PATTERNS:
- [Чего избегать]
</writing_style>
{{setvar::narrative::[Имя Автора или Название стиля]}}

<dialogue>
Emulate the dialogue rhythm of [Имя/Стиль].{{setvar::dialogue::[Имя/Стиль]}}
- [Правило пинг-понга реплик]
- [Как звучат голоса]
- [Специфика лексики]
</dialogue>

ВАЖНО:
1. Вывод должен содержать ТОЛЬКО эти два блока. Никаких пояснений.
2. Используй английский язык для самих инструкций (так нейронки лучше понимают), даже если запрос на русском.
3. Обязательно включи конструкции {{setvar::narrative::...}} и {{setvar::dialogue::...}}.
`;

    async function generateStyle(userRequest) {
        // 1. Формируем промпт
        const prompt = GENERATOR_PROMPT.replace("{{USER_REQUEST}}", userRequest);

        toastr.info("Генерирую новый стиль... Подождите.", "Style Generator");

        try {
            // 2. Отправляем запрос нейронке (используем внутреннюю функцию ST для "тихой" генерации)
            // В зависимости от версии ST API может отличаться, это стандартный метод:
            const result = await generateQuiet(prompt); 
            
            if (!result) throw new Error("Пустой ответ от нейросети");

            // 3. Парсим ответ (ищем блоки XML)
            const styleMatch = result.match(/<writing_style>[\s\S]*?<\/writing_style>[\s\S]*?{{setvar::narrative::.*?}}/);
            const dialogueMatch = result.match(/<dialogue>[\s\S]*?<\/dialogue>/); // dialogue блок часто содержит setvar внутри себя в твоем примере

            // Для надежности захватим диалог чуть шире, если setvar внутри
            
            let newStyleContent = styleMatch ? styleMatch[0] : null;
            let newDialogueContent = result.match(/<dialogue>[\s\S]*?<\/dialogue>/) ? result.match(/<dialogue>[\s\S]*?<\/dialogue>/)[0] : null;

            if (!newStyleContent || !newDialogueContent) {
                // Попытка запасного парсинга, если нейронка ответила немного иначе
                console.log("Raw result:", result);
                toastr.warning("Нейросеть вернула неверный формат. Проверь консоль (F12).", "Ошибка парсинга");
                return;
            }

            // 4. Внедряем в пресет
            applyToPreset(newStyleContent, newDialogueContent);

        } catch (e) {
            console.error(e);
            toastr.error("Ошибка генерации: " + e.message);
        }
    }

    function applyToPreset(styleContent, dialogueContent) {
        // Получаем текущие настройки расширенного форматирования
        // В SillyTavern промпты лежат в глобальном массиве (обычно)
        
        let prompts = null;
        
        // Пытаемся найти массив промптов в разных местах (зависит от версии ST)
        if (window.advanced_formatting && window.advanced_formatting.regex_scripts) {
             // Это старое место, но проверим prompts
        }
        
        // Самый надежный способ в новых версиях - через глобальную переменную настроек
        // Обычно это `SillyTavern.contexts.advanced_definitions` или загруженный файл
        // Но проще всего редактировать текущий загруженный список:
        
        const context = getContext(); // Глобальная функция ST
        
        // В ST промпты часто дублируются в settings object. 
        // Нам нужно найти массив `prompts` в текущем контексте или глобальных настройках.
        
        // ВАЖНО: SillyTavern хранит активные промпты в `advanced_formatting.prompts` (если они загружены)
        if (!window.advanced_formatting || !window.advanced_formatting.prompts) {
             toastr.error("Не могу найти загруженные промпты. Убедитесь, что пресет выбран.");
             return;
        }

        let updatedCount = 0;

        window.advanced_formatting.prompts.forEach(p => {
            if (p.identifier === WRITING_STYLE_ID) {
                p.content = styleContent;
                updatedCount++;
                console.log("Обновлен Writing Style");
            }
            if (p.identifier === DIALOGUE_ID) {
                p.content = dialogueContent;
                updatedCount++;
                console.log("Обновлен Dialogue");
            }
        });

        if (updatedCount === 0) {
            toastr.error("Не найдены нужные ID промптов! Проверь, тот ли пресет загружен.");
            return;
        }

        // Сохраняем настройки
        saveGenerationSettings(); // Сохраняет настройки генерации/пресетов
        toastr.success("Стиль успешно обновлен! Можно писать.", "Успех");
    }

    // Создаем UI
    function createUI() {
        const modalHtml = `
            <div id="style-gen-modal" class="extension_menu_popup" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9999; background:#202123; padding:20px; border:1px solid #444; border-radius:10px; width: 400px;">
                <h3>🎨 Генератор Стиля</h3>
                <p>Опиши желаемый стиль (автор, жанр, настроение):</p>
                <textarea id="style-gen-input" class="text_pole" rows="4" placeholder="Например: Стиль Лавкрафта, нагнетающий ужас, старинные слова..."></textarea>
                <br><br>
                <div style="display:flex; justify-content:space-between;">
                    <button id="style-gen-cancel" class="menu_button">Отмена</button>
                    <button id="style-gen-submit" class="menu_button">🎲 Сгенерировать</button>
                </div>
            </div>
        `;
        $('body').append(modalHtml);

        // Кнопка в меню расширений
        const btnHtml = `<div id="open-style-gen" class="menu_button">🎨 Сменить стиль</div>`;
        $('#extensions_settings').append(btnHtml);

        // Обработчики
        $('#open-style-gen').click(() => $('#style-gen-modal').show());
        $('#style-gen-cancel').click(() => $('#style-gen-modal').hide());
        
        $('#style-gen-submit').click(async () => {
            const request = $('#style-gen-input').val();
            if (!request) return;
            $('#style-gen-modal').hide();
            await generateStyle(request);
        });
    }

    $(document).ready(function () {
        createUI();
    });
})();
