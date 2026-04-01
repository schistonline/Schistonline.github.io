// ============================================
// CHAT SETTINGS - User Preferences
// ============================================

const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const MAIN_SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const mainSupabase = window.supabase.createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY);
const chatSupabase = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

let currentUser = null;
let settings = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadSettings();
    loadUserProfile();
    setupEventListeners();
});

// Check authentication
async function checkAuth() {
    const { data: { user }, error } = await mainSupabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'login.html?redirect=chat-settings.html';
        return;
    }
    currentUser = user;
}

// Load user profile
async function loadUserProfile() {
    try {
        const { data, error } = await mainSupabase
            .from('profiles')
            .select('full_name, email, phone, avatar_url')
            .eq('id', currentUser.id)
            .single();
        
        if (error) throw error;
        
        if (data) {
            document.getElementById('displayName').textContent = data.full_name || 'User';
            document.getElementById('avatarInitials').textContent = (data.full_name || 'U').charAt(0).toUpperCase();
        }
        
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Load chat settings
async function loadSettings() {
    try {
        const { data, error } = await chatSupabase
            .from('user_chat_settings')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        if (data) {
            settings = data;
            applySettings();
        } else {
            // Create default settings
            await createDefaultSettings();
        }
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Create default settings
async function createDefaultSettings() {
    const defaultSettings = {
        user_id: currentUser.id,
        theme: 'dark',
        notifications_enabled: true,
        notification_sound: 'default',
        message_preview_enabled: true,
        last_seen_enabled: true,
        read_receipts_enabled: true,
        typing_indicators_enabled: true,
        wallpaper_url: 'default',
        font_size: 'medium'
    };
    
    try {
        const { data, error } = await chatSupabase
            .from('user_chat_settings')
            .insert(defaultSettings)
            .select()
            .single();
        
        if (error) throw error;
        
        settings = data;
        applySettings();
        
    } catch (error) {
        console.error('Error creating default settings:', error);
    }
}

// Apply settings to UI
function applySettings() {
    // Notifications
    const notificationsToggle = document.getElementById('notificationsToggle');
    if (notificationsToggle) {
        notificationsToggle.checked = settings.notifications_enabled;
        notificationsToggle.onchange = (e) => updateSetting('notifications_enabled', e.target.checked);
    }
    
    // Message Preview
    const previewToggle = document.getElementById('previewToggle');
    if (previewToggle) {
        previewToggle.checked = settings.message_preview_enabled;
        previewToggle.onchange = (e) => updateSetting('message_preview_enabled', e.target.checked);
    }
    
    // Read Receipts
    const readReceiptsToggle = document.getElementById('readReceiptsToggle');
    if (readReceiptsToggle) {
        readReceiptsToggle.checked = settings.read_receipts_enabled;
        readReceiptsToggle.onchange = (e) => updateSetting('read_receipts_enabled', e.target.checked);
    }
    
    // Typing Indicators
    const typingToggle = document.getElementById('typingToggle');
    if (typingToggle) {
        typingToggle.checked = settings.typing_indicators_enabled;
        typingToggle.onchange = (e) => updateSetting('typing_indicators_enabled', e.target.checked);
    }
    
    // Sound
    const soundValue = document.getElementById('soundValue');
    if (soundValue) {
        soundValue.textContent = settings.notification_sound === 'none' ? 'None' : 
                                 settings.notification_sound === 'classic' ? 'Classic' :
                                 settings.notification_sound === 'gentle' ? 'Gentle' : 'Default';
    }
    
    // Last Seen
    const lastSeenValue = document.getElementById('lastSeenValue');
    if (lastSeenValue) {
        lastSeenValue.textContent = settings.last_seen_enabled ? 'Everyone' : 'Nobody';
    }
    
    // Theme
    const themeValue = document.getElementById('themeValue');
    if (themeValue) {
        themeValue.textContent = settings.theme === 'dark' ? 'Dark' :
                                 settings.theme === 'light' ? 'Light' :
                                 settings.theme === 'whatsapp_green' ? 'WhatsApp Green' : 'Schist Purple';
        applyTheme();
    }
    
    // Wallpaper
    const wallpaperValue = document.getElementById('wallpaperValue');
    if (wallpaperValue) {
        wallpaperValue.textContent = settings.wallpaper_url === 'default' ? 'Default' :
                                      settings.wallpaper_url === 'light' ? 'Light Pattern' : 'Dark Pattern';
    }
    
    // Font Size
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeValue) {
        fontSizeValue.textContent = settings.font_size === 'small' ? 'Small' :
                                     settings.font_size === 'medium' ? 'Medium' :
                                     settings.font_size === 'large' ? 'Large' : 'Extra Large';
    }
}

// Update setting
async function updateSetting(key, value) {
    try {
        const { error } = await chatSupabase
            .from('user_chat_settings')
            .update({ [key]: value, updated_at: new Date().toISOString() })
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        settings[key] = value;
        
        // Show success feedback
        showFeedback('Settings updated');
        
    } catch (error) {
        console.error('Error updating setting:', error);
        showFeedback('Failed to update setting', 'error');
    }
}

// Apply theme
function applyTheme() {
    const theme = settings.theme;
    const root = document.documentElement;
    
    if (theme === 'dark') {
        document.body.style.background = '#111B21';
    } else if (theme === 'light') {
        document.body.style.background = '#F0F2F5';
    } else if (theme === 'whatsapp_green') {
        document.body.style.background = '#128C7E';
    } else if (theme === 'schist_purple') {
        document.body.style.background = '#6B21E5';
    }
}

// Show feedback
function showFeedback(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 16px;
        right: 16px;
        background: ${type === 'error' ? '#EF4444' : '#25D366'};
        color: white;
        padding: 12px;
        border-radius: 8px;
        text-align: center;
        z-index: 2000;
        animation: fadeInUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Open modals
window.selectSound = function() {
    document.getElementById('soundModal').classList.add('active');
};

window.selectSoundOption = function(option) {
    const soundMap = {
        'Default': 'default',
        'None': 'none',
        'Classic': 'classic',
        'Gentle': 'gentle'
    };
    updateSetting('notification_sound', soundMap[option]);
    document.getElementById('soundModal').classList.remove('active');
    document.getElementById('soundValue').textContent = option;
};

window.selectWallpaper = function() {
    document.getElementById('wallpaperModal').classList.add('active');
};

window.selectWallpaperOption = function(option) {
    updateSetting('wallpaper_url', option);
    document.getElementById('wallpaperModal').classList.remove('active');
    
    const value = option === 'default' ? 'Default' : option === 'light' ? 'Light Pattern' : 'Dark Pattern';
    document.getElementById('wallpaperValue').textContent = value;
};

window.selectTheme = function() {
    document.getElementById('themeModal').classList.add('active');
};

window.selectThemeOption = function(option) {
    const themeMap = {
        'Dark': 'dark',
        'Light': 'light',
        'WhatsApp Green': 'whatsapp_green',
        'Schist Purple': 'schist_purple'
    };
    updateSetting('theme', themeMap[option]);
    document.getElementById('themeModal').classList.remove('active');
    document.getElementById('themeValue').textContent = option;
    applyTheme();
};

window.selectLastSeen = function() {
    const newValue = !settings.last_seen_enabled;
    updateSetting('last_seen_enabled', newValue);
    document.getElementById('lastSeenValue').textContent = newValue ? 'Everyone' : 'Nobody';
};

window.selectFontSize = function() {
    const sizes = ['small', 'medium', 'large', 'extra_large'];
    const currentIndex = sizes.indexOf(settings.font_size);
    const nextIndex = (currentIndex + 1) % sizes.length;
    const nextSize = sizes[nextIndex];
    
    updateSetting('font_size', nextSize);
    
    const sizeMap = {
        'small': 'Small',
        'medium': 'Medium',
        'large': 'Large',
        'extra_large': 'Extra Large'
    };
    document.getElementById('fontSizeValue').textContent = sizeMap[nextSize];
    
    // Apply font size to chat
    const fontSizeMap = {
        'small': '12px',
        'medium': '14px',
        'large': '16px',
        'extra_large': '18px'
    };
    document.body.style.fontSize = fontSizeMap[nextSize];
};

window.editName = function() {
    const newName = prompt('Enter your display name:', document.getElementById('displayName').textContent);
    if (newName && newName.trim()) {
        mainSupabase
            .from('profiles')
            .update({ full_name: newName.trim() })
            .eq('id', currentUser.id)
            .then(() => {
                document.getElementById('displayName').textContent = newName.trim();
                document.getElementById('avatarInitials').textContent = newName.trim().charAt(0).toUpperCase();
                showFeedback('Name updated successfully');
            })
            .catch(err => {
                console.error('Error updating name:', err);
                showFeedback('Failed to update name', 'error');
            });
    }
};

window.editAbout = function() {
    const newAbout = prompt('Enter your about status:', document.getElementById('aboutStatus').textContent);
    if (newAbout && newAbout.trim()) {
        // Store about status in user_chat_settings or profiles
        updateSetting('about_status', newAbout.trim());
        document.getElementById('aboutStatus').textContent = newAbout.trim();
        showFeedback('About updated successfully');
    }
};

window.changePhoto = function() {
    alert('Photo upload feature coming soon!');
};

window.viewPhoto = function() {
    alert('View photo feature coming soon!');
};

window.blockedContacts = function() {
    alert('Blocked contacts feature coming soon!');
};

window.manageStorage = function() {
    alert('Storage management feature coming soon!');
};

window.faq = function() {
    window.location.href = 'help.html?topic=chat';
};

window.reportProblem = function() {
    window.location.href = 'contact.html?subject=chat-issue';
};

window.aboutApp = function() {
    alert('Schist.online Chat\nVersion 1.0.0\n\nUganda\'s premier B2B marketplace messaging system.');
};

// Setup event listeners
function setupEventListeners() {
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);