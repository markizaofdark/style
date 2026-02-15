(function () {
    const extensionName = "style-generator";
    
    // ID твоих промптов (проверь, что они совпадают с твоим JSON)
    const WRITING_STYLE_ID = "5d917cfc-5200-4a6a-8729-035c7433bd0b";
    const DIALOGUE_ID = "73c2e4f4-ca2f-482b-bf44-c7b53a7dedb6";

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

    // Функция-обертка для безопасного вызова генерации
    async function safeGenerate(prompt) {
        // Проверяем, доступна ли функция в глобальной области
        if (typeof window.generateQuiet === "function") {
            return await window.generateQuiet(prompt);
        } 
        // Если вдруг версия ST старая или функция называется иначе
        else if (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext().generateQuiet) {
            return await window.SillyTavern.getContext().generateQuiet(prompt);
        }
        else {
            throw new Error("Функция генерации (generateQuiet) не найдена! Обновите SillyTavern.");
        }
    }

    async function generateStyle(userRequest) {
        const prompt = GENERATOR_PROMPT.replace("{{USER_REQUEST}}", userRequest);

        toastr.info("Генерирую новый стиль... Используется текущая модель.", "Style Generator");

        try {
            // ИСПОЛЬЗУЕМ БЕЗОПАСНУЮ ФУНКЦИЮ
            const result = await safeGenerate(prompt); 
            
            if (!result) throw new Error("Пустой ответ от нейросети");
            console.log("Ответ нейросети:", result); // Для отладки

            // Парсинг
            const styleMatch = result.match(/<writing_style>[\s\S]*?<\/writing_style>[\s\S]*?{{setvar::narrative::.*?}}/);
            // Для диалога регулярка чуть гибче, так как setvar может быть внутри
            const dialogueMatch = result.match(/<dialogue>[\s\S]*?<\/dialogue>/);

            let newStyleContent = styleMatch ? styleMatch[0] : null;
            let newDialogueContent = dialogueMatch ? dialogueMatch[0] : null;

            if (!newStyleContent || !newDialogueContent) {
                console.warn("Не удалось распарсить ответ. Сырой ответ:", result);
                toastr.warning("Нейросеть ответила не по формату. Попробуй еще раз.", "Ошибка парсинга");
                return;
            }

            applyToPreset(newStyleContent, newDialogueContent);

        } catch (e) {
            console.error(e);
            toastr.error("Ошибка: " + e.message);
        }
    }

    function applyToPreset(styleContent, dialogueContent) {
        // Проверяем наличие промптов
        if (!window.advanced_formatting || !window.advanced_formatting.prompts) {
             toastr.error("Не могу найти загруженные промпты. Убедитесь, что пресет выбран.");
             return;
        }

        let updatedCount = 0;

        window.advanced_formatting.prompts.forEach(p => {
            if (p.identifier === WRITING_STYLE_ID) {
                p.content = styleContent;
                updatedCount++;
            }
            if (p.identifier === DIALOGUE_ID) {
                p.content = dialogueContent;
                updatedCount++;
            }
        });

        if (updatedCount === 0) {
            toastr.error("ID промптов не найдены! Проверь JSON пресета.");
            return;
        }

        // Сохраняем настройки
        if (window.saveGenerationSettings) {
            window.saveGenerationSettings();
        } else {
            // Фолбэк для старых версий
            toastr.warning("Не удалось сохранить настройки автоматически (функция не найдена).");
        }
        
        toastr.success("Стиль успешно обновлен!", "Готово");
    }

    function createUI() {
        // Удаляем старую кнопку если она есть (при перезагрузке скрипта)
        $('#open-style-gen').remove();
        $('#style-gen-modal').remove();

        const modalHtml = `
            <div id="style-gen-modal" class="extension_menu_popup" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9999; background:#202123; padding:20px; border:1px solid #444; border-radius:10px; width: 400px; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                <h3 style="margin-top:0;">🎨 Генератор Стиля</h3>
                <p style="font-size: 0.9em; opacity: 0.8;">Генерация займет 5-10 сек. Используется текущая подключенная модель.</p>
                <textarea id="style-gen-input" class="text_pole" rows="4" placeholder="Например: Стиль Лавкрафта, нагнетающий ужас, старинные слова..." style="width:100%; margin-bottom: 10px;"></textarea>
                <div style="display:flex; justify-content:space-between;">
                    <button id="style-gen-cancel" class="menu_button">Отмена</button>
                    <button id="style-gen-submit" class="menu_button">🎲 Сгенерировать</button>
                </div>
            </div>
        `;
        $('body').append(modalHtml);

        const btnHtml = `<div id="open-style-gen" class="menu_button">🎨 Сменить стиль</div>`;
        $('#extensions_settings').append(btnHtml);

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
