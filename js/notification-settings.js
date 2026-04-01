// ============================================
// NOTIFICATION SETTINGS MANAGEMENT
// Complete settings interface for notification preferences
// ============================================

console.log('⚙️ Notification Settings loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const NotificationSettings = {
    currentUser: null,
    settings: {
        push: {
            enabled: true,
            sound: true,
            vibrate: true,
            preview: true,
            ledColor: '#0B4F6C',
            throttling: '50'
        },
        email: {
            enabled: true,
            orders: true,
            inquiries: true,
            quotes: true,
            messages: true,
            promotions: false,
            digest: true,
            digestFrequency: 'daily'
        },
        sms: {
            enabled: false,
            phone: '',
            orders: true,
            payments: true,
            delivery: true
        },
        app: {
            orders: true,
            inquiries: true,
            quotes: true,
            messages: true,
            system: true,
            promotions: false
        },
        quietHours: {
            enabled: false,
            start: 22,
            end: 6,
            exceptions: false,
            repeat: true,
            days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        },
        history: {
            retention: '30',
            autoArchive: true
        },
        blocked: [
            { type: 'supplier', value: 'Sample Supplier', icon: 'fa-store' },
            { type: 'type', value: 'promotion', icon: 'fa-tag' }
        ]
    },
    blockedSources: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Notification Settings initializing...');
        
        try {
            await this.checkAuth();
            await this.loadUserProfile();
            await this.loadSettings();
            this.renderBlockedList();
            this.setupEventListeners();
            
            // Hide loading, show content
            const loadingEl = document.getElementById('loadingState');
            const settingsEl = document.getElementById('settingsContainer');
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (settingsEl) settingsEl.style.display = 'block';
            
            console.log('✅ Notification Settings initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading settings', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=notification-settings.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadUserProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('email, phone, full_name')
                .eq('id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            
            // Update UI with user info
            const userEmail = document.getElementById('userEmail');
            const userPhone = document.getElementById('userPhone');
            
            if (userEmail) userEmail.textContent = data.email || 'No email';
            if (userPhone) userPhone.textContent = data.phone || 'Not set';
            
            this.settings.sms.phone = data.phone || '';
            
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },
    
    // ============================================
    // LOAD SETTINGS
    // ============================================
    async loadSettings() {
        try {
            // Try to load from localStorage first
            const saved = localStorage.getItem('notificationSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.settings = this.mergeSettings(this.settings, parsed);
            }
            
            // Try to load from database if available
            const { data, error } = await sb
                .from('user_settings')
                .select('notification_settings')
                .eq('user_id', this.currentUser.id)
                .maybeSingle();
            
            if (data?.notification_settings) {
                this.settings = this.mergeSettings(this.settings, data.notification_settings);
            }
            
            // Apply settings to UI
            this.applySettingsToUI();
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    },
    
    mergeSettings(defaults, saved) {
        return {
            ...defaults,
            ...saved,
            push: { ...defaults.push, ...saved.push },
            email: { ...defaults.email, ...saved.email },
            sms: { ...defaults.sms, ...saved.sms },
            app: { ...defaults.app, ...saved.app },
            quietHours: { ...defaults.quietHours, ...saved.quietHours },
            history: { ...defaults.history, ...saved.history }
        };
    },
    
    applySettingsToUI() {
        // Push settings
        const pushEnabled = document.getElementById('pushEnabled');
        const pushSound = document.getElementById('pushSound');
        const pushVibrate = document.getElementById('pushVibrate');
        const pushPreview = document.getElementById('pushPreview');
        const ledColor = document.getElementById('ledColor');
        const pushThrottling = document.getElementById('pushThrottling');
        
        if (pushEnabled) pushEnabled.checked = this.settings.push.enabled;
        if (pushSound) pushSound.checked = this.settings.push.sound;
        if (pushVibrate) pushVibrate.checked = this.settings.push.vibrate;
        if (pushPreview) pushPreview.checked = this.settings.push.preview;
        if (ledColor) ledColor.value = this.settings.push.ledColor;
        if (pushThrottling) pushThrottling.value = this.settings.push.throttling;
        
        // Email settings
        const emailEnabled = document.getElementById('emailEnabled');
        const emailOrders = document.getElementById('emailOrders');
        const emailInquiries = document.getElementById('emailInquiries');
        const emailQuotes = document.getElementById('emailQuotes');
        const emailMessages = document.getElementById('emailMessages');
        const emailPromotions = document.getElementById('emailPromotions');
        const emailDigest = document.getElementById('emailDigest');
        const digestFrequency = document.getElementById('digestFrequency');
        
        if (emailEnabled) emailEnabled.checked = this.settings.email.enabled;
        if (emailOrders) emailOrders.checked = this.settings.email.orders;
        if (emailInquiries) emailInquiries.checked = this.settings.email.inquiries;
        if (emailQuotes) emailQuotes.checked = this.settings.email.quotes;
        if (emailMessages) emailMessages.checked = this.settings.email.messages;
        if (emailPromotions) emailPromotions.checked = this.settings.email.promotions;
        if (emailDigest) emailDigest.checked = this.settings.email.digest;
        if (digestFrequency) digestFrequency.value = this.settings.email.digestFrequency;
        
        // SMS settings
        const smsEnabled = document.getElementById('smsEnabled');
        const smsPhone = document.getElementById('smsPhone');
        const smsOrders = document.getElementById('smsOrders');
        const smsPayments = document.getElementById('smsPayments');
        const smsDelivery = document.getElementById('smsDelivery');
        const smsOptions = document.getElementById('smsOptions');
        
        if (smsEnabled) {
            smsEnabled.checked = this.settings.sms.enabled;
            if (smsOptions) {
                smsOptions.style.display = this.settings.sms.enabled ? 'block' : 'none';
            }
        }
        if (smsPhone) smsPhone.value = this.settings.sms.phone;
        if (smsOrders) smsOrders.checked = this.settings.sms.orders;
        if (smsPayments) smsPayments.checked = this.settings.sms.payments;
        if (smsDelivery) smsDelivery.checked = this.settings.sms.delivery;
        
        // App settings
        const appOrders = document.getElementById('appOrders');
        const appInquiries = document.getElementById('appInquiries');
        const appQuotes = document.getElementById('appQuotes');
        const appMessages = document.getElementById('appMessages');
        const appSystem = document.getElementById('appSystem');
        const appPromotions = document.getElementById('appPromotions');
        
        if (appOrders) appOrders.checked = this.settings.app.orders;
        if (appInquiries) appInquiries.checked = this.settings.app.inquiries;
        if (appQuotes) appQuotes.checked = this.settings.app.quotes;
        if (appMessages) appMessages.checked = this.settings.app.messages;
        if (appSystem) appSystem.checked = this.settings.app.system;
        if (appPromotions) appPromotions.checked = this.settings.app.promotions;
        
        // Quiet hours
        const quietHours = document.getElementById('quietHours');
        const quietStart = document.getElementById('quietStart');
        const quietEnd = document.getElementById('quietEnd');
        const quietExceptions = document.getElementById('quietExceptions');
        const quietRepeat = document.getElementById('quietRepeat');
        const quietHoursOptions = document.getElementById('quietHoursOptions');
        const quietDays = document.getElementById('quietDays');
        
        if (quietHours) {
            quietHours.checked = this.settings.quietHours.enabled;
            if (quietHoursOptions) {
                quietHoursOptions.style.display = this.settings.quietHours.enabled ? 'block' : 'none';
            }
        }
        if (quietStart) quietStart.value = this.settings.quietHours.start;
        if (quietEnd) quietEnd.value = this.settings.quietHours.end;
        if (quietExceptions) quietExceptions.checked = this.settings.quietHours.exceptions;
        if (quietRepeat) {
            quietRepeat.checked = this.settings.quietHours.repeat;
            if (quietDays) {
                quietDays.style.display = this.settings.quietHours.repeat ? 'none' : 'block';
            }
        }
        
        // Update day buttons
        if (this.settings.quietHours.days) {
            document.querySelectorAll('.day-btn').forEach(btn => {
                const day = btn.dataset.day;
                btn.classList.toggle('active', this.settings.quietHours.days.includes(day));
            });
        }
        
        // History settings
        const historyRetention = document.getElementById('historyRetention');
        const autoArchive = document.getElementById('autoArchive');
        
        if (historyRetention) historyRetention.value = this.settings.history.retention;
        if (autoArchive) autoArchive.checked = this.settings.history.autoArchive;
    },
    
    // ============================================
    // SAVE SETTINGS
    // ============================================
    async saveSettings() {
        // Collect all settings from UI
        this.collectSettingsFromUI();
        
        try {
            // Save to localStorage
            localStorage.setItem('notificationSettings', JSON.stringify(this.settings));
            
            // Save to database if table exists
            const { error } = await sb
                .from('user_settings')
                .upsert({
                    user_id: this.currentUser.id,
                    notification_settings: this.settings,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });
            
            if (error && error.code !== '42P01') { // Ignore if table doesn't exist
                console.error('Error saving to database:', error);
            }
            
            this.showToast('Settings saved successfully', 'success');
            
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('Error saving settings', 'error');
        }
    },
    
    collectSettingsFromUI() {
        // Push settings
        this.settings.push.enabled = document.getElementById('pushEnabled')?.checked || false;
        this.settings.push.sound = document.getElementById('pushSound')?.checked || false;
        this.settings.push.vibrate = document.getElementById('pushVibrate')?.checked || false;
        this.settings.push.preview = document.getElementById('pushPreview')?.checked || false;
        this.settings.push.ledColor = document.getElementById('ledColor')?.value || '#0B4F6C';
        this.settings.push.throttling = document.getElementById('pushThrottling')?.value || '50';
        
        // Email settings
        this.settings.email.enabled = document.getElementById('emailEnabled')?.checked || false;
        this.settings.email.orders = document.getElementById('emailOrders')?.checked || false;
        this.settings.email.inquiries = document.getElementById('emailInquiries')?.checked || false;
        this.settings.email.quotes = document.getElementById('emailQuotes')?.checked || false;
        this.settings.email.messages = document.getElementById('emailMessages')?.checked || false;
        this.settings.email.promotions = document.getElementById('emailPromotions')?.checked || false;
        this.settings.email.digest = document.getElementById('emailDigest')?.checked || false;
        this.settings.email.digestFrequency = document.getElementById('digestFrequency')?.value || 'daily';
        
        // SMS settings
        this.settings.sms.enabled = document.getElementById('smsEnabled')?.checked || false;
        this.settings.sms.phone = document.getElementById('smsPhone')?.value || '';
        this.settings.sms.orders = document.getElementById('smsOrders')?.checked || false;
        this.settings.sms.payments = document.getElementById('smsPayments')?.checked || false;
        this.settings.sms.delivery = document.getElementById('smsDelivery')?.checked || false;
        
        // App settings
        this.settings.app.orders = document.getElementById('appOrders')?.checked || false;
        this.settings.app.inquiries = document.getElementById('appInquiries')?.checked || false;
        this.settings.app.quotes = document.getElementById('appQuotes')?.checked || false;
        this.settings.app.messages = document.getElementById('appMessages')?.checked || false;
        this.settings.app.system = document.getElementById('appSystem')?.checked || false;
        this.settings.app.promotions = document.getElementById('appPromotions')?.checked || false;
        
        // Quiet hours
        this.settings.quietHours.enabled = document.getElementById('quietHours')?.checked || false;
        this.settings.quietHours.start = parseInt(document.getElementById('quietStart')?.value) || 22;
        this.settings.quietHours.end = parseInt(document.getElementById('quietEnd')?.value) || 6;
        this.settings.quietHours.exceptions = document.getElementById('quietExceptions')?.checked || false;
        this.settings.quietHours.repeat = document.getElementById('quietRepeat')?.checked || true;
        
        // Collect active days
        this.settings.quietHours.days = [];
        document.querySelectorAll('.day-btn.active').forEach(btn => {
            this.settings.quietHours.days.push(btn.dataset.day);
        });
        
        // History settings
        this.settings.history.retention = document.getElementById('historyRetention')?.value || '30';
        this.settings.history.autoArchive = document.getElementById('autoArchive')?.checked || false;
    },
    
    // ============================================
    // BLOCKED SOURCES
    // ============================================
    renderBlockedList() {
        const container = document.getElementById('blockedList');
        if (!container) return;
        
        if (this.settings.blocked.length === 0) {
            container.innerHTML = `
                <div class="empty-blocked">
                    <i class="fas fa-check-circle"></i>
                    <p>No blocked sources</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.settings.blocked.map((item, index) => `
            <div class="blocked-item">
                <div class="blocked-info">
                    <i class="fas ${item.icon || 'fa-ban'}"></i>
                    <span>${this.escapeHtml(item.value)}</span>
                </div>
                <button class="unblock-btn" onclick="NotificationSettings.unblockSource(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },
    
    unblockSource(index) {
        this.settings.blocked.splice(index, 1);
        this.renderBlockedList();
        this.showToast('Source unblocked', 'success');
    },
    
    addBlockedSource() {
        const type = document.getElementById('blockType')?.value;
        const value = document.getElementById('blockValue')?.value;
        
        if (!value) {
            this.showToast('Please enter a value', 'error');
            return;
        }
        
        const icons = {
            supplier: 'fa-store',
            category: 'fa-tag',
            keyword: 'fa-key',
            type: 'fa-bell-slash'
        };
        
        this.settings.blocked.push({
            type,
            value,
            icon: icons[type] || 'fa-ban'
        });
        
        this.renderBlockedList();
        this.closeBlockModal();
        this.showToast('Source blocked', 'success');
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    openBlockModal() {
        document.getElementById('blockModal').classList.add('show');
    },
    
    closeBlockModal() {
        document.getElementById('blockModal').classList.remove('show');
        document.getElementById('blockValue').value = '';
    },
    
    openSuccessModal(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('show');
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    openConfirmModal(title, message, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        
        const confirmBtn = document.getElementById('confirmActionBtn');
        confirmBtn.onclick = () => {
            onConfirm();
            this.closeConfirmModal();
        };
        
        document.getElementById('confirmModal').classList.add('show');
    },
    
    closeConfirmModal() {
        document.getElementById('confirmModal').classList.remove('show');
    },
    
    // ============================================
    // DANGER ZONE ACTIONS
    // ============================================
    disableAllNotifications() {
        this.openConfirmModal(
            'Disable All Notifications',
            'Are you sure you want to disable all notification channels? You will not receive any updates.',
            () => {
                // Uncheck all push settings
                document.getElementById('pushEnabled').checked = false;
                document.getElementById('emailEnabled').checked = false;
                document.getElementById('smsEnabled').checked = false;
                
                // Hide dependent options
                document.getElementById('smsOptions').style.display = 'none';
                document.getElementById('quietHoursOptions').style.display = 'none';
                
                this.saveSettings();
                this.showToast('All notifications disabled', 'info');
            }
        );
    },
    
    resetToDefaults() {
        this.openConfirmModal(
            'Reset to Defaults',
            'This will restore all notification settings to their default values. This action cannot be undone.',
            () => {
                localStorage.removeItem('notificationSettings');
                location.reload();
            }
        );
    },
    
    exportSettings() {
        const dataStr = JSON.stringify(this.settings, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `notification-settings-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showToast('Settings exported', 'success');
    },
    
    clearHistory() {
        this.openConfirmModal(
            'Clear Notification History',
            'Are you sure you want to clear all notification history? This action cannot be undone.',
            async () => {
                try {
                    const { error } = await sb
                        .from('notifications')
                        .delete()
                        .eq('user_id', this.currentUser.id);
                    
                    if (error) throw error;
                    
                    this.showToast('Notification history cleared', 'success');
                } catch (error) {
                    console.error('Error clearing history:', error);
                    this.showToast('Error clearing history', 'error');
                }
            }
        );
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Save button
        const saveBtn = document.getElementById('saveSettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveSettings();
            });
        }
        
        // SMS toggle
        const smsEnabled = document.getElementById('smsEnabled');
        const smsOptions = document.getElementById('smsOptions');
        if (smsEnabled && smsOptions) {
            smsEnabled.addEventListener('change', (e) => {
                smsOptions.style.display = e.target.checked ? 'block' : 'none';
            });
        }
        
        // Quiet hours toggle
        const quietHours = document.getElementById('quietHours');
        const quietHoursOptions = document.getElementById('quietHoursOptions');
        if (quietHours && quietHoursOptions) {
            quietHours.addEventListener('change', (e) => {
                quietHoursOptions.style.display = e.target.checked ? 'block' : 'none';
            });
        }
        
        // Quiet hours repeat toggle
        const quietRepeat = document.getElementById('quietRepeat');
        const quietDays = document.getElementById('quietDays');
        if (quietRepeat && quietDays) {
            quietRepeat.addEventListener('change', (e) => {
                quietDays.style.display = e.target.checked ? 'none' : 'flex';
            });
        }
        
        // Day buttons
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.classList.toggle('active');
            });
        });
        
        // Add block button
        const addBlockBtn = document.getElementById('addBlockBtn');
        if (addBlockBtn) {
            addBlockBtn.addEventListener('click', () => {
                this.openBlockModal();
            });
        }
        
        // Danger zone buttons
        const disableAllBtn = document.getElementById('disableAllBtn');
        if (disableAllBtn) {
            disableAllBtn.addEventListener('click', () => {
                this.disableAllNotifications();
            });
        }
        
        const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
        if (resetDefaultsBtn) {
            resetDefaultsBtn.addEventListener('click', () => {
                this.resetToDefaults();
            });
        }
        
        const exportSettingsBtn = document.getElementById('exportSettingsBtn');
        if (exportSettingsBtn) {
            exportSettingsBtn.addEventListener('click', () => {
                this.exportSettings();
            });
        }
        
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                this.clearHistory();
            });
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeBlockModal();
                    this.closeSuccessModal();
                    this.closeConfirmModal();
                }
            });
        });
        
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeBlockModal();
                this.closeSuccessModal();
                this.closeConfirmModal();
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    NotificationSettings.init();
});

// Global functions
window.NotificationSettings = NotificationSettings;
window.closeBlockModal = () => NotificationSettings.closeBlockModal();
window.closeSuccessModal = () => NotificationSettings.closeSuccessModal();
window.closeConfirmModal = () => NotificationSettings.closeConfirmModal();
window.addBlockedSource = () => NotificationSettings.addBlockedSource();
window.unblockSource = (index) => NotificationSettings.unblockSource(index);