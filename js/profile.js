// ============================================
// PROFILE PAGE - BUYUGANDA.ONLINE
// ============================================

console.log('🚀 Profile page loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Account Types
const ACCOUNT_TYPES = {
    regular: { name: 'Regular Buyer', icon: 'fa-user', color: '#0B4F6C', badgeClass: 'buyer' },
    supplier: { name: 'Supplier', icon: 'fa-store', color: '#10B981', table: 'suppliers', foreignKey: 'profile_id', dashboard: 'supplier-dashboard.html', signupPath: 'supplier-register.html', badgeClass: 'supplier' },
    poultry: { name: 'Poultry Supplier', icon: 'fa-dove', color: '#F59E0B', table: 'poultry_suppliers', foreignKey: 'profile_id', dashboard: 'poultry-dashboard.html', signupPath: 'poultry-register.html', badgeClass: 'poultry' },
    logistics: { name: 'Logistics Partner', icon: 'fa-truck', color: '#EF4444', table: 'logistics_providers', foreignKey: 'profile_id', dashboard: 'logistics-dashboard.html', signupPath: 'logistics-register.html', badgeClass: 'logistics' },
    admin: { name: 'Administrator', icon: 'fa-crown', color: '#8B5CF6', dashboard: 'admin-dashboard.html', badgeClass: 'admin' }
};

const ProfileManager = {
    currentUser: null,
    profile: null,
    activeAccounts: {},
    
    async init() {
        console.log('📊 Initializing...');
        try {
            await this.checkAuth();
            
            if (this.currentUser) {
                await this.loadProfile();
                await this.loadAllAccounts();
                await this.loadStats();
                await this.loadReferralData();
                this.renderProfile();
                this.renderAccountTypes();
                this.setupEventListeners();
                document.getElementById('loadingState').style.display = 'none';
                document.getElementById('profileContent').style.display = 'block';
            } else {
                document.getElementById('loadingState').style.display = 'none';
                document.getElementById('notLoggedInContent').style.display = 'block';
            }
            console.log('✅ Initialized');
        } catch (error) {
            console.error('❌ Error:', error);
            this.showError();
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            if (error || !user) {
                this.currentUser = null;
                return false;
            }
            this.currentUser = user;
            return true;
        } catch (error) {
            this.currentUser = null;
            return false;
        }
    },
    
    async loadProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .maybeSingle();
            
            if (error) throw error;
            
            if (!data) {
                // Create profile if missing
                const { data: newProfile, error: insertError } = await sb
                    .from('profiles')
                    .insert({
                        id: this.currentUser.id,
                        email: this.currentUser.email,
                        full_name: this.currentUser.user_metadata?.full_name || this.currentUser.email?.split('@')[0],
                        is_buyer: true,
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                
                if (insertError) throw insertError;
                this.profile = newProfile;
            } else {
                this.profile = data;
            }
            
            console.log('✅ Profile loaded');
        } catch (error) {
            console.error('Error loading profile:', error);
            throw error;
        }
    },
    
    async loadAllAccounts() {
        for (const [type, config] of Object.entries(ACCOUNT_TYPES)) {
            if (config.table) {
                await this.checkAccountType(type, config);
            }
        }
        
        if (this.profile?.is_admin) {
            this.activeAccounts.admin = { type: 'admin', data: { is_admin: true } };
        }
    },
    
    async checkAccountType(type, config) {
        try {
            const { data, error } = await sb
                .from(config.table)
                .select('*')
                .eq(config.foreignKey, this.currentUser.id)
                .maybeSingle();
            
            if (!error && data) {
                this.activeAccounts[type] = { type, data, config };
            }
        } catch (error) {
            console.error(`Error checking ${type}:`, error);
        }
    },
    
    async loadStats() {
        try {
            // Messages count
            const { count: messagesCount } = await sb
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', this.currentUser.id)
                .eq('is_read', false);
            document.getElementById('messageBadge').textContent = messagesCount || 0;
            
            // Notifications
            const { count: notificationsCount } = await sb
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', this.currentUser.id)
                .eq('is_read', false);
            document.getElementById('notificationBadge').textContent = notificationsCount || 0;
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },
    
    async loadReferralData() {
        try {
            // Get referral stats
            const { data: referrals } = await sb
                .from('referrals')
                .select('id')
                .eq('referrer_id', this.currentUser.id);
            
            document.getElementById('profileReferrals').textContent = referrals?.length || 0;
            
            // Get earnings from user_credits
            const { data: credits } = await sb
                .from('user_credits')
                .select('cash_balance, credit_balance, total_earned')
                .eq('user_id', this.currentUser.id)
                .maybeSingle();
            
            if (credits) {
                document.getElementById('profileEarnings').textContent = `UGX ${(credits.total_earned || 0).toLocaleString()}`;
                document.getElementById('profileCredits').textContent = credits.credit_balance || 0;
            }
            
            // Also check wallets
            const { data: wallet } = await sb
                .from('wallets')
                .select('total_earned')
                .eq('user_id', this.currentUser.id)
                .maybeSingle();
            
            if (wallet && wallet.total_earned > (credits?.total_earned || 0)) {
                document.getElementById('profileEarnings').textContent = `UGX ${(wallet.total_earned || 0).toLocaleString()}`;
            }
            
        } catch (error) {
            console.error('Error loading referral data:', error);
        }
    },
    
    renderProfile() {
        this.renderProfileHeader();
    },
    
    renderProfileHeader() {
        const name = this.profile.full_name || 'User';
        const email = this.profile.email || this.currentUser.email;
        const avatarUrl = this.profile.avatar_url;
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        document.getElementById('profileAvatar').innerHTML = avatarUrl ? 
            `<img src="${avatarUrl}" alt="${name}">` : `<span style="font-size: 32px;">${initials}</span>`;
        
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileEmail').textContent = email;
        
        const created = new Date(this.profile.created_at || Date.now());
        document.getElementById('memberSince').textContent = created.getFullYear();
        
        // Badges
        const badgesContainer = document.getElementById('profileBadges');
        let badgesHtml = '';
        
        for (const [type] of Object.entries(this.activeAccounts)) {
            const config = ACCOUNT_TYPES[type];
            if (config) {
                badgesHtml += `<span class="badge ${config.badgeClass}"><i class="fas ${config.icon}"></i> ${config.name}</span>`;
            }
        }
        
        if (Object.keys(this.activeAccounts).length === 0 || (this.profile.is_buyer && !this.activeAccounts.supplier)) {
            badgesHtml += '<span class="badge buyer"><i class="fas fa-shopping-cart"></i> Buyer</span>';
        }
        
        badgesContainer.innerHTML = badgesHtml;
    },
    
    renderAccountTypes() {
        const container = document.getElementById('accountTypesGrid');
        if (!container) return;
        
        const activeTypes = Object.values(this.activeAccounts);
        
        if (activeTypes.length === 0) {
            container.innerHTML = '<p style="color: #6B7280; text-align: center;">No active account types</p>';
            return;
        }
        
        container.innerHTML = activeTypes.map(account => {
            const config = ACCOUNT_TYPES[account.type];
            return `
                <div class="account-type-card">
                    <div class="account-icon" style="background: ${config.color}20; color: ${config.color};">
                        <i class="fas ${config.icon}"></i>
                    </div>
                    <div class="account-info">
                        <h4>${config.name}</h4>
                        <p>${this.getAccountDescription(account.type)}</p>
                    </div>
                    <a href="${config.dashboard || '#'}" class="account-action-btn">
                        <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            `;
        }).join('');
    },
    
    getAccountDescription(type) {
        const descriptions = {
            supplier: 'Sell products to businesses',
            poultry: 'Sell live birds to buyers',
            logistics: 'Offer delivery services',
            admin: 'Manage platform settings',
            regular: 'Browse and purchase products'
        };
        return descriptions[type] || 'Active account';
    },
    
    setupEventListeners() {
        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
        
        document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await sb.auth.signOut();
            window.location.href = 'index.html';
        });
    },
    
    showError() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ProfileManager.init();
});
