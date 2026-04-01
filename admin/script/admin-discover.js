// ============================================
// ADMIN DISCOVER - CONDUCIVE CATEGORY MANAGEMENT
// ============================================

console.log('🚀 Admin Discover JS loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Check if Supabase is available
if (typeof supabase === 'undefined') {
    console.error('❌ Supabase client not loaded!');
} else {
    console.log('✅ Supabase client loaded');
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const DiscoverAdmin = {
    currentUser: null,
    currentSession: null,
    categories: [],
    filteredCategories: [],
    currentCategory: null,
    filters: {
        search: '',
        status: 'all'
    },
    
    // Common icons for categories
    commonIcons: [
        'fa-mobile-alt', 'fa-laptop', 'fa-tshirt', 'fa-shoe-prints', 'fa-ring',
        'fa-couch', 'fa-car', 'fa-book', 'fa-dumbbell', 'fa-futbol',
        'fa-utensils', 'fa-wine-bottle', 'fa-camera', 'fa-headphones',
        'fa-gamepad', 'fa-gem', 'fa-leaf', 'fa-paw', 'fa-baby',
        'fa-tools', 'fa-paint-brush', 'fa-music', 'fa-bicycle', 'fa-ship',
        'fa-home', 'fa-store', 'fa-building', 'fa-tree', 'fa-cloud',
        'fa-heart', 'fa-star', 'fa-clock', 'fa-calendar', 'fa-envelope'
    ],
    
    // Tagline templates for auto-generation
    taglineTemplates: {
        'electronics': 'Discover the latest in technology and innovation',
        'fashion': 'Style meets comfort - express yourself',
        'clothing': 'Elevate your wardrobe with our collection',
        'home': 'Make your house a home with quality finds',
        'furniture': 'Design spaces you\'ll love coming home to',
        'kitchen': 'Create culinary masterpieces with our kitchen essentials',
        'automotive': 'Keep your ride running smoothly',
        'cars': 'Drive in style and comfort',
        'sports': 'Gear up for your best performance',
        'fitness': 'Achieve your fitness goals with premium gear',
        'beauty': 'Enhance your natural beauty',
        'health': 'Your wellness journey starts here',
        'books': 'Expand your knowledge, one page at a time',
        'toys': 'Spark imagination and creativity',
        'gaming': 'Level up your gaming experience',
        'food': 'Savor the flavors of quality ingredients',
        'beverages': 'Refresh with our premium selection',
        'pets': 'Spoil your furry friends with love',
        'office': 'Work smarter with our office solutions',
        'garden': 'Cultivate your perfect outdoor space',
        'tools': 'Build and repair with professional tools',
        'jewelry': 'Adorn yourself with elegance',
        'watches': 'Timeless style for every occasion',
        'bags': 'Carry your essentials in style',
        'shoes': 'Step out in comfort and style',
        'baby': 'Everything precious for your little one',
        'music': 'Feel the rhythm with quality audio',
        'photography': 'Capture moments that matter',
        'art': 'Express yourself through art',
        'crafts': 'Create something beautiful'
    },
    
    // ============================================
    // AUTHENTICATION
    // ============================================
    async checkAuth() {
        console.log('🔐 Checking authentication...');
        
        try {
            // Get current session
            const { data: { session }, error: sessionError } = await sb.auth.getSession();
            
            if (sessionError) throw sessionError;
            
            if (!session) {
                console.log('⚠️ No active session, redirecting to login');
                // Store current page to redirect back
                sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
                window.location.href = 'admin-login.html';
                return false;
            }

            // Get user details
            const { data: { user }, error: userError } = await sb.auth.getUser();
            
            if (userError) throw userError;
            
            if (!user) {
                console.log('⚠️ No user found, redirecting to login');
                window.location.href = 'admin-login.html';
                return false;
            }

            // Check if user is admin
            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .select('is_admin, email, full_name')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('❌ Error checking admin status:', profileError);
                // If profile doesn't exist, redirect to complete profile
                if (profileError.code === 'PGRST116') {
                    window.location.href = 'complete-profile.html';
                    return false;
                }
                throw profileError;
            }

            if (!profile?.is_admin) {
                console.log('⚠️ User is not admin, redirecting to home');
                window.location.href = 'index.html';
                return false;
            }
            
            this.currentUser = user;
            this.currentSession = session;
            
            console.log('✅ Authentication successful:', user.email);
            
            // Update UI to show logged in state
            this.updateAuthUI(user.email);
            
            return true;
            
        } catch (error) {
            console.error('❌ Auth check error:', error);
            
            // Handle specific error cases
            if (error.message?.includes('Invalid login credentials')) {
                this.showToast('Invalid email or password', 'error');
            } else if (error.message?.includes('Email not confirmed')) {
                this.showToast('Please confirm your email address', 'error');
            } else if (error.message?.includes('Network')) {
                this.showToast('Network error. Please check your connection.', 'error');
            } else {
                this.showToast('Authentication error. Please login again.', 'error');
            }
            
            // Redirect to login after a delay
            setTimeout(() => {
                window.location.href = 'admin-login.html';
            }, 2000);
            
            return false;
        }
    },
    
    // ============================================
    // LOGOUT FUNCTION
    // ============================================
    async logout() {
        try {
            const { error } = await sb.auth.signOut();
            if (error) throw error;
            
            this.showToast('Logged out successfully', 'success');
            
            setTimeout(() => {
                window.location.href = 'admin-login.html';
            }, 1000);
            
        } catch (error) {
            console.error('❌ Logout error:', error);
            this.showToast('Error logging out', 'error');
        }
    },
    
    // ============================================
    // UPDATE UI WITH USER INFO
    // ============================================
    updateAuthUI(userEmail) {
        // Add user info to header if it doesn't exist
        const header = document.querySelector('.content-header');
        if (header && !document.getElementById('user-menu')) {
            const userMenu = document.createElement('div');
            userMenu.id = 'user-menu';
            userMenu.className = 'user-menu';
            userMenu.innerHTML = `
                <div class="user-info">
                    <i class="fas fa-user-circle"></i>
                    <span>${this.escapeHtml(userEmail)}</span>
                </div>
                <button class="btn btn-outline btn-sm" onclick="window.DiscoverAdmin.logout()">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            `;
            
            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                .user-menu {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-left: auto;
                    padding-left: 20px;
                    border-left: 1px solid #e5e7eb;
                }
                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #4b5563;
                    font-size: 14px;
                }
                .user-info i {
                    font-size: 20px;
                    color: #0B4F6C;
                }
            `;
            document.head.appendChild(style);
            
            header.appendChild(userMenu);
        }
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 DiscoverAdmin initializing...');
        
        try {
            // First check authentication
            const isAuthenticated = await this.checkAuth();
            
            if (!isAuthenticated) {
                return; // Will redirect
            }
            
            // Load data only if authenticated
            await this.loadCategories();
            this.setupEventListeners();
            
            console.log('✅ DiscoverAdmin initialized successfully');
            
        } catch (error) {
            console.error('❌ Error during initialization:', error);
            this.showToast('Error initializing page', 'error');
        }
    },
    
    // ============================================
    // LOAD CATEGORIES (with authentication check)
    // ============================================
    async loadCategories() {
        console.log('📦 Loading categories...');
        
        const grid = document.getElementById('categoriesGrid');
        if (!grid) return;
        
        grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><div>Loading categories...</div></div>';

        try {
            const { data, error } = await sb
                .from('categories')
                .select('*')
                .order('display_order', { ascending: true, nullsFirst: false })
                .order('name', { ascending: true });

            if (error) throw error;

            // Separate parent categories from subcategories
            const parentCategories = data.filter(c => !c.parent_id);
            const subCategories = data.filter(c => c.parent_id);
            
            this.categories = data || [];
            
            // Count parent categories vs subcategories
            const parentCount = parentCategories.length;
            const subCount = subCategories.length;
            
            console.log(`✅ Loaded ${this.categories.length} categories (${parentCount} parent, ${subCount} sub)`);
            
            this.filteredCategories = [...this.categories];
            this.updateStats(parentCount, subCount);
            this.renderCategories();

        } catch (error) {
            console.error('❌ Error loading categories:', error);
            
            // Check if error is due to auth
            if (error.message?.includes('JWT') || error.status === 401) {
                this.showToast('Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'admin-login.html';
                }, 2000);
            } else {
                grid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">Error loading categories</div>';
                this.showToast('Failed to load categories', 'error');
            }
        }
    },
    
    // ============================================
    // RENDER CATEGORIES (with parent/child indication)
    // ============================================
    renderCategories() {
        const grid = document.getElementById('categoriesGrid');
        if (!grid) return;
        
        if (this.filteredCategories.length === 0) {
            grid.innerHTML = `
                <div class="loading">
                    <i class="fas fa-folder-open"></i>
                    <div>No categories found</div>
                </div>
            `;
            return;
        }
        
        // Separate parent and child categories for display
        const parentCategories = this.filteredCategories.filter(c => !c.parent_id);
        const subCategories = this.filteredCategories.filter(c => c.parent_id);
        
        // First show parent categories, then subcategories
        const sortedCategories = [...parentCategories, ...subCategories];
        
        grid.innerHTML = sortedCategories.map(cat => {
            const hasTagline = !!cat.conducive_tagline;
            const hasIcon = !!cat.conducive_icon;
            const hasColor = !!cat.color_hex;
            
            const fieldsCount = [hasTagline, hasIcon, hasColor].filter(Boolean).length;
            let status = 'missing';
            let statusText = 'Missing Fields';
            
            if (fieldsCount === 3) {
                status = 'complete';
                statusText = 'Complete';
            } else if (fieldsCount > 0) {
                status = 'partial';
                statusText = 'Partial';
            }
            
            const icon = cat.conducive_icon || 'fa-tag';
            const color = cat.color_hex || '#0B4F6C';
            
            // Find parent name if this is a subcategory
            let parentInfo = '';
            if (cat.parent_id) {
                const parent = this.categories.find(c => c.id === cat.parent_id);
                if (parent) {
                    parentInfo = `<div class="parent-info"><i class="fas fa-level-up-alt"></i> Subcategory of ${this.escapeHtml(parent.display_name || parent.name)}</div>`;
                }
            }
            
            return `
                <div class="category-card ${status}" data-id="${cat.id}" data-parent="${cat.parent_id || 'root'}">
                    <div class="category-header">
                        <div class="category-icon" style="color: ${color}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="category-info">
                            <div class="category-name">
                                ${this.escapeHtml(cat.display_name || cat.name)}
                                ${cat.parent_id ? '<span class="sub-badge">Sub</span>' : ''}
                            </div>
                            <div class="category-slug">${cat.slug || ''}</div>
                            ${parentInfo}
                        </div>
                    </div>
                    
                    ${cat.conducive_tagline ? `
                        <div class="conducive-preview" style="--preview-color: ${color}">
                            <div class="conducive-tagline">
                                <i class="fas fa-quote-right"></i>
                                <span>${this.escapeHtml(cat.conducive_tagline)}</span>
                            </div>
                            <div class="conducive-meta">
                                <span><i class="fas fa-icons"></i> ${icon}</span>
                                <span><i class="fas fa-palette"></i> ${color}</span>
                            </div>
                        </div>
                    ` : `
                        <div class="conducive-preview" style="background: #f9fafb; color: #9ca3af;">
                            <div style="text-align: center; padding: 8px;">
                                <i class="fas fa-plus-circle"></i> No conducive fields yet
                            </div>
                        </div>
                    `}
                    
                    <div class="category-footer">
                        <span class="status-badge ${status}">${statusText}</span>
                        <div class="category-actions">
                            <button class="action-btn" onclick="window.DiscoverAdmin.editCategory(${cat.id})" title="Edit Conducive Fields">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn" onclick="window.DiscoverAdmin.autoGenerateForCategory(${cat.id})" title="Auto-Generate">
                                <i class="fas fa-magic"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add some CSS for the sub-badge
        const style = document.createElement('style');
        style.textContent = `
            .sub-badge {
                display: inline-block;
                padding: 2px 6px;
                background: #e5e7eb;
                color: #4b5563;
                border-radius: 4px;
                font-size: 10px;
                font-weight: normal;
                margin-left: 8px;
            }
            .parent-info {
                font-size: 11px;
                color: #6b7280;
                margin-top: 2px;
            }
            .parent-info i {
                font-size: 10px;
                margin-right: 4px;
                color: #9ca3af;
            }
        `;
        document.head.appendChild(style);
    },
    
    // ============================================
    // STATS UPDATE (with parent/child counts)
    // ============================================
    updateStats(parentCount, subCount) {
        const total = this.categories.length;
        const withTaglines = this.categories.filter(c => c.conducive_tagline).length;
        const withIcons = this.categories.filter(c => c.conducive_icon).length;
        const withColors = this.categories.filter(c => c.color_hex).length;
        
        document.getElementById('totalCategories').textContent = total;
        document.getElementById('withTaglines').textContent = withTaglines;
        document.getElementById('withIcons').textContent = withIcons;
        document.getElementById('withColors').textContent = withColors;
        
        // Add parent/sub info to stats
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid && !document.getElementById('parentCount')) {
            // Add two more stat cards for parent/sub counts
            const parentCard = document.createElement('div');
            parentCard.className = 'stat-card';
            parentCard.id = 'parentCount';
            parentCard.innerHTML = `
                <div class="stat-info">
                    <h3>Parent Categories</h3>
                    <div class="stat-number">${parentCount || 0}</div>
                </div>
                <div class="stat-icon">
                    <i class="fas fa-folder"></i>
                </div>
            `;
            
            const subCard = document.createElement('div');
            subCard.className = 'stat-card';
            subCard.id = 'subCount';
            subCard.innerHTML = `
                <div class="stat-info">
                    <h3>Subcategories</h3>
                    <div class="stat-number">${subCount || 0}</div>
                </div>
                <div class="stat-icon">
                    <i class="fas fa-folder-open"></i>
                </div>
            `;
            
            statsGrid.appendChild(parentCard);
            statsGrid.appendChild(subCard);
        } else {
            const parentEl = document.getElementById('parentCount');
            const subEl = document.getElementById('subCount');
            if (parentEl) parentEl.querySelector('.stat-number').textContent = parentCount || 0;
            if (subEl) subEl.querySelector('.stat-number').textContent = subCount || 0;
        }
    },
    
    // ============================================
    // SAVE CATEGORY (with auth token)
    // ============================================
    async saveCategory(event) {
        event.preventDefault();
        
        const categoryId = document.getElementById('categoryId').value;
        const tagline = document.getElementById('conduciveTagline').value;
        const icon = document.getElementById('iconInput').value;
        const color = document.getElementById('colorPicker').value;
        
        // Check if user is still authenticated
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
            this.showToast('Session expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = 'admin-login.html';
            }, 1500);
            return;
        }
        
        try {
            this.showToast('Saving changes...', 'info');
            
            const { error } = await sb
                .from('categories')
                .update({
                    conducive_tagline: tagline || null,
                    conducive_icon: icon || null,
                    color_hex: color,
                    updated_at: new Date().toISOString(),
                    updated_by: this.currentUser?.id
                })
                .eq('id', categoryId);
                
            if (error) throw error;
            
            this.closeModal();
            await this.loadCategories();
            this.showSuccess('Conducive fields saved successfully');
            
        } catch (error) {
            console.error('Error saving category:', error);
            
            // Check if error is due to auth
            if (error.message?.includes('JWT') || error.code === 'PGRST301') {
                this.showToast('Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'admin-login.html';
                }, 1500);
            } else {
                this.showToast('Error saving changes: ' + error.message, 'error');
            }
        }
    },
    
    // ============================================
    // BULK GENERATE (with auth check)
    // ============================================
    async bulkGenerate() {
        // Check if user is still authenticated
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
            this.showToast('Session expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = 'admin-login.html';
            }, 1500);
            return;
        }
        
        if (!confirm('This will generate taglines and icons for all categories without them. Continue?')) return;
        
        this.showToast('Generating conducive fields...', 'info');
        
        let updated = 0;
        let errors = 0;
        
        for (const category of this.categories) {
            const updates = {};
            
            if (!category.conducive_tagline) {
                updates.conducive_tagline = this.generateTagline(category.name);
            }
            
            if (!category.conducive_icon) {
                updates.conducive_icon = this.suggestIcon(category.name);
            }
            
            if (!category.color_hex) {
                updates.color_hex = this.suggestColor(category.name);
            }
            
            if (Object.keys(updates).length > 0) {
                try {
                    const { error } = await sb
                        .from('categories')
                        .update({
                            ...updates,
                            updated_at: new Date().toISOString(),
                            updated_by: this.currentUser?.id
                        })
                        .eq('id', category.id);
                        
                    if (error) throw error;
                    updated++;
                } catch (error) {
                    console.error(`Error updating category ${category.id}:`, error);
                    errors++;
                }
            }
        }
        
        await this.loadCategories();
        this.showSuccess(`Generated fields for ${updated} categories${errors ? ` (${errors} failed)` : ''}`);
    },
    
    // ... (rest of your existing functions remain the same)
    
    // ============================================
    // FILTERS
    // ============================================
    applyFilters() {
        this.filters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        this.filters.status = document.getElementById('statusFilter')?.value || 'all';
        
        this.filteredCategories = this.categories.filter(cat => {
            // Search filter
            if (this.filters.search) {
                const name = (cat.display_name || cat.name).toLowerCase();
                if (!name.includes(this.filters.search)) return false;
            }
            
            // Status filter
            if (this.filters.status !== 'all') {
                const hasTagline = !!cat.conducive_tagline;
                const hasIcon = !!cat.conducive_icon;
                const hasColor = !!cat.color_hex;
                const fieldsCount = [hasTagline, hasIcon, hasColor].filter(Boolean).length;
                
                if (this.filters.status === 'complete' && fieldsCount !== 3) return false;
                if (this.filters.status === 'partial' && (fieldsCount === 0 || fieldsCount === 3)) return false;
                if (this.filters.status === 'missing' && fieldsCount > 0) return false;
            }
            
            return true;
        });
        
        this.renderCategories();
    },
    
    resetFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = 'all';
        
        this.filters = {
            search: '',
            status: 'all'
        };
        
        this.filteredCategories = [...this.categories];
        this.renderCategories();
        this.showToast('Filters reset', 'success');
    },
    
    // ============================================
    // CATEGORY EDITING
    // ============================================
    async editCategory(categoryId) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;
        
        this.currentCategory = category;
        
        // Populate modal
        document.getElementById('categoryId').value = category.id;
        document.getElementById('conduciveTagline').value = category.conducive_tagline || '';
        document.getElementById('iconInput').value = category.conducive_icon || 'fa-tag';
        document.getElementById('colorPicker').value = category.color_hex || '#0B4F6C';
        document.getElementById('colorInput').value = category.color_hex || '#0B4F6C';
        
        // Update category info with parent info
        const infoDiv = document.getElementById('modalCategoryInfo');
        let parentText = '';
        if (category.parent_id) {
            const parent = this.categories.find(c => c.id === category.parent_id);
            if (parent) {
                parentText = `<p><small>Parent: ${this.escapeHtml(parent.display_name || parent.name)}</small></p>`;
            }
        }
        
        infoDiv.innerHTML = `
            <h4>${this.escapeHtml(category.display_name || category.name)}</h4>
            <p>Slug: ${category.slug || ''} | ID: ${category.id}</p>
            ${parentText}
        `;
        
        // Update preview
        this.updatePreview();
        
        document.getElementById('conduciveModal').classList.add('show');
    },
    
    // ============================================
    // PREVIEW FUNCTIONS
    // ============================================
    updatePreview() {
        const tagline = document.getElementById('conduciveTagline')?.value || '';
        const icon = document.getElementById('iconInput')?.value || 'fa-tag';
        const color = document.getElementById('colorPicker')?.value || '#0B4F6C';
        const title = this.currentCategory?.display_name || this.currentCategory?.name || 'Category';
        
        // Update preview card
        const previewCard = document.querySelector('.preview-card');
        if (previewCard) {
            previewCard.style.background = `linear-gradient(135deg, ${color}, ${this.adjustColor(color, -20)})`;
        }
        
        document.getElementById('previewIcon').innerHTML = `<i class="fas ${icon}"></i>`;
        document.getElementById('previewTitle').textContent = title;
        document.getElementById('previewTagline').textContent = tagline || 'Your tagline will appear here';
    },
    
    adjustColor(hex, percent) {
        let R = parseInt(hex.substring(1,3), 16);
        let G = parseInt(hex.substring(3,5), 16);
        let B = parseInt(hex.substring(5,7), 16);
        
        R = Math.min(255, Math.max(0, R + percent));
        G = Math.min(255, Math.max(0, G + percent));
        B = Math.min(255, Math.max(0, B + percent));
        
        return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
    },
    
    updateColorFromText(hex) {
        if (/^#[0-9A-F]{6}$/i.test(hex)) {
            document.getElementById('colorPicker').value = hex;
            this.updatePreview();
        }
    },
    
    setIcon(icon) {
        document.getElementById('iconInput').value = icon;
        this.updatePreview();
    },
    
    setColor(color) {
        document.getElementById('colorPicker').value = color;
        document.getElementById('colorInput').value = color;
        this.updatePreview();
    },
    
    // ============================================
    // AUTO-GENERATION FUNCTIONS
    // ============================================
    async autoGenerateForCategory(categoryId) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;
        
        const tagline = this.generateTagline(category.name);
        const icon = this.suggestIcon(category.name);
        
        document.getElementById('conduciveTagline').value = tagline;
        document.getElementById('iconInput').value = icon;
        this.updatePreview();
        
        this.showToast('Tagline and icon generated! Click Save to apply.', 'success');
    },
    
    autoGenerateTagline() {
        if (!this.currentCategory) return;
        
        const tagline = this.generateTagline(this.currentCategory.name);
        document.getElementById('conduciveTagline').value = tagline;
        this.updatePreview();
        this.showToast('Tagline generated!', 'success');
    },
    
    autoGenerateIcon() {
        if (!this.currentCategory) return;
        
        const icon = this.suggestIcon(this.currentCategory.name);
        document.getElementById('iconInput').value = icon;
        this.updatePreview();
        this.showToast('Icon suggested!', 'success');
    },
    
    generateTagline(categoryName) {
        const lowerName = categoryName.toLowerCase();
        
        // Check for exact matches in templates
        for (const [key, template] of Object.entries(this.taglineTemplates)) {
            if (lowerName.includes(key)) {
                return template;
            }
        }
        
        // Generate based on name
        if (lowerName.includes('accessori')) {
            return `Complete your look with our ${categoryName}`;
        }
        if (lowerName.includes('equip')) {
            return `Professional-grade ${categoryName} for every need`;
        }
        if (lowerName.includes('suppli')) {
            return `Everything you need in ${categoryName}`;
        }
        
        // Default
        return `Explore our premium collection of ${categoryName}`;
    },
    
    suggestIcon(categoryName) {
        const lowerName = categoryName.toLowerCase();
        
        const iconMap = {
            'electronics': 'fa-microchip',
            'mobile': 'fa-mobile-alt',
            'phone': 'fa-phone',
            'computer': 'fa-laptop',
            'laptop': 'fa-laptop',
            'tablet': 'fa-tablet',
            'tv': 'fa-tv',
            'audio': 'fa-headphones',
            'music': 'fa-music',
            'camera': 'fa-camera',
            'photo': 'fa-camera',
            'video': 'fa-video',
            'gaming': 'fa-gamepad',
            'game': 'fa-gamepad',
            'fashion': 'fa-tshirt',
            'clothing': 'fa-tshirt',
            'shirt': 'fa-tshirt',
            'dress': 'fa-tshirt',
            'shoe': 'fa-shoe-prints',
            'footwear': 'fa-shoe-prints',
            'jewelry': 'fa-gem',
            'watch': 'fa-clock',
            'home': 'fa-home',
            'furniture': 'fa-couch',
            'couch': 'fa-couch',
            'bed': 'fa-bed',
            'kitchen': 'fa-utensils',
            'cook': 'fa-utensils',
            'food': 'fa-utensils',
            'beverage': 'fa-wine-bottle',
            'drink': 'fa-wine-bottle',
            'car': 'fa-car',
            'auto': 'fa-car',
            'vehicle': 'fa-car',
            'bike': 'fa-bicycle',
            'sports': 'fa-futbol',
            'fitness': 'fa-dumbbell',
            'gym': 'fa-dumbbell',
            'health': 'fa-heartbeat',
            'beauty': 'fa-spa',
            'cosmetic': 'fa-spa',
            'book': 'fa-book',
            'read': 'fa-book',
            'toy': 'fa-puzzle-piece',
            'baby': 'fa-baby',
            'pet': 'fa-paw',
            'animal': 'fa-paw',
            'garden': 'fa-leaf',
            'plant': 'fa-leaf',
            'tool': 'fa-tools',
            'hardware': 'fa-tools',
            'office': 'fa-briefcase',
            'business': 'fa-briefcase',
            'bag': 'fa-shopping-bag',
            'travel': 'fa-suitcase'
        };
        
        for (const [key, icon] of Object.entries(iconMap)) {
            if (lowerName.includes(key)) {
                return icon;
            }
        }
        
        return 'fa-tag';
    },
    
    suggestColor(categoryName) {
        const lowerName = categoryName.toLowerCase();
        
        // Suggest colors based on category
        if (lowerName.includes('electronics')) return '#2563EB'; // Blue
        if (lowerName.includes('fashion')) return '#EC4899'; // Pink
        if (lowerName.includes('clothing')) return '#8B5CF6'; // Purple
        if (lowerName.includes('home')) return '#D97706'; // Amber
        if (lowerName.includes('furniture')) return '#B45309'; // Brown
        if (lowerName.includes('kitchen')) return '#DC2626'; // Red
        if (lowerName.includes('food')) return '#DC2626'; // Red
        if (lowerName.includes('beauty')) return '#DB2777'; // Pink
        if (lowerName.includes('health')) return '#059669'; // Green
        if (lowerName.includes('sports')) return '#EA580C'; // Orange
        if (lowerName.includes('automotive')) return '#4B5563'; // Gray
        if (lowerName.includes('books')) return '#7C3AED'; // Purple
        if (lowerName.includes('toys')) return '#F59E0B'; // Yellow
        if (lowerName.includes('baby')) return '#F472B6'; // Light Pink
        
        return '#0B4F6C'; // Default blue
    },
    
    // ============================================
    // ICON LIBRARY
    // ============================================
    openIconLibrary() {
        const modal = document.getElementById('iconLibraryModal');
        const grid = document.getElementById('iconsGrid');
        
        grid.innerHTML = this.commonIcons.map(icon => `
            <div class="icon-item" onclick="window.DiscoverAdmin.selectIcon('${icon}')">
                <i class="fas ${icon}"></i>
            </div>
        `).join('');
        
        modal.classList.add('show');
        
        // Setup search
        const searchInput = document.getElementById('iconSearch');
        searchInput.value = '';
        searchInput.focus();
        searchInput.addEventListener('input', this.filterIcons.bind(this));
    },
    
    filterIcons(e) {
        const search = e.target.value.toLowerCase();
        const icons = document.querySelectorAll('.icon-item');
        
        icons.forEach(icon => {
            const iconClass = icon.querySelector('i').className;
            const matches = iconClass.toLowerCase().includes(search);
            icon.style.display = matches ? 'flex' : 'none';
        });
    },
    
    selectIcon(icon) {
        document.getElementById('iconInput').value = icon;
        this.updatePreview();
        this.closeIconLibrary();
    },
    
    closeIconLibrary() {
        document.getElementById('iconLibraryModal').classList.remove('show');
    },
    
    // ============================================
    // EXPORT
    // ============================================
    exportConduciveData() {
        const data = this.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            display_name: cat.display_name,
            parent_id: cat.parent_id,
            conducive_tagline: cat.conducive_tagline || '',
            conducive_icon: cat.conducive_icon || '',
            color_hex: cat.color_hex || '',
            has_tagline: !!cat.conducive_tagline,
            has_icon: !!cat.conducive_icon,
            has_color: !!cat.color_hex,
            is_subcategory: !!cat.parent_id
        }));
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conducive_data_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('Data exported successfully', 'success');
    },
    
    // ============================================
    // MODAL CONTROLS
    // ============================================
    closeModal() {
        document.getElementById('conduciveModal').classList.remove('show');
        this.currentCategory = null;
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.style.backgroundColor = type === 'success' ? '#10B981' : 
                                    type === 'error' ? '#EF4444' : '#0B4F6C';
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    showSuccess(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('show');
        
        setTimeout(() => {
            document.getElementById('successModal').classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        console.log('🔧 Setting up event listeners...');
        
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.applyFilters(), 300);
            });
        }
        
        // Status filter
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.applyFilters());
        }
        
        // Form submission
        const form = document.getElementById('conduciveForm');
        if (form) {
            form.addEventListener('submit', (e) => this.saveCategory(e));
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                    this.closeIconLibrary();
                }
            });
        });
        
        console.log('✅ Event listeners setup complete');
    }
};

// ============================================
// INITIALIZATION
// ============================================
console.log('📦 DiscoverAdmin object created, waiting for DOMContentLoaded...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded, initializing...');
    DiscoverAdmin.init();
});

// Make functions globally available
window.DiscoverAdmin = DiscoverAdmin;
console.log('✅ DiscoverAdmin attached to window object');