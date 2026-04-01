// ============================================
// ADMIN FILTERS MANAGEMENT
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const AdminFilters = {
    currentUser: null,
    filters: [],
    filterCategories: [],
    filterTypes: [],
    currentFilterId: null,
    
    async init() {
        console.log('🔧 Initializing admin filters...');
        
        await this.checkAuth();
        await this.loadFilterCategories();
        await this.loadFilterTypes();
        await this.loadFilters();
        this.setupEventListeners();
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            
            if (!user) {
                window.location.href = 'admin-login.html?returnUrl=' + encodeURIComponent(window.location.href);
                return;
            }
            
            const { data: profile, error } = await sb
                .from('profiles')
                .select('is_admin, full_name, email, avatar_url')
                .eq('id', user.id)
                .single();
                
            if (error || !profile?.is_admin) {
                await sb.auth.signOut();
                window.location.href = 'admin-login.html?error=unauthorized';
                return;
            }
            
            this.currentUser = { ...user, ...profile };
            this.updateUserInfo();
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'admin-login.html';
        }
    },
    
    updateUserInfo() {
        const nameEl = document.getElementById('adminName');
        const initialsEl = document.getElementById('adminInitials');
        
        if (nameEl) {
            nameEl.textContent = this.currentUser?.full_name || this.currentUser?.email || 'Admin User';
        }
        
        if (initialsEl) {
            const name = this.currentUser?.full_name || this.currentUser?.email || 'Admin User';
            initialsEl.textContent = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        }
    },
    
    async loadFilterCategories() {
        try {
            const { data, error } = await sb
                .from('filter_categories')
                .select('*')
                .order('display_order');
                
            if (error) throw error;
            
            this.filterCategories = data || [];
            console.log(`✅ Loaded ${this.filterCategories.length} filter categories`);
            
        } catch (error) {
            console.error('Error loading filter categories:', error);
            this.filterCategories = [];
        }
    },
    
    async loadFilterTypes() {
        try {
            const { data, error } = await sb
                .from('filter_types')
                .select('*')
                .order('id');
                
            if (error) throw error;
            
            this.filterTypes = data || [];
            console.log(`✅ Loaded ${this.filterTypes.length} filter types`);
            
        } catch (error) {
            console.error('Error loading filter types:', error);
            this.filterTypes = [];
        }
    },
    
    async loadFilters() {
        try {
            console.log('📊 Loading filters from view...');
            
            const { data, error } = await sb
                .from('filters_with_options')
                .select('*')
                .order('display_order');
                
            if (error) throw error;
            
            // Transform the data to match expected structure
            this.filters = (data || []).map(item => ({
                id: item.id,
                name: item.name,
                display_name: item.display_name,
                description: item.description,
                filter_category_id: item.category_id, // Note: renamed in view
                filter_type_id: item.type_id,         // Note: renamed in view
                table_name: item.table_name,
                column_name: item.column_name,
                data_type: item.data_type,
                icon: item.icon,
                color_hex: item.color_hex,
                display_order: item.display_order,
                min_value: item.min_value,
                max_value: item.max_value,
                step_value: item.step_value,
                is_collapsible: item.is_collapsible,
                is_expanded_by_default: item.is_expanded_by_default,
                show_search: item.show_search,
                show_count: item.show_count,
                appears_in_search: item.appears_in_search,
                appears_in_carousel: item.appears_in_carousel,
                appears_in_sidebar: item.appears_in_sidebar,
                appears_in_modal: item.appears_in_modal,
                is_active: item.is_active,
                is_required: item.is_required,
                created_by: item.created_by,
                created_at: item.created_at,
                updated_at: item.updated_at,
                
                // Nested objects for compatibility with existing render code
                filter_category: item.filter_category_id ? {
                    id: item.filter_category_id,
                    name: item.filter_category_name,
                    display_name: item.filter_category_display_name,
                    icon: item.filter_category_icon,
                    color_hex: item.filter_category_color
                } : null,
                
                filter_type: item.filter_type_id ? {
                    id: item.filter_type_id,
                    name: item.filter_type_name,
                    display_name: item.filter_type_display_name,
                    has_min_max: item.has_min_max,
                    has_options: item.has_options
                } : null,
                
                filter_options: item.filter_options || []
            }));
            
            console.log(`✅ Successfully loaded ${this.filters.length} filters via view`);
            
            // Render the filters
            this.renderCategoryTabs();
            this.renderFilters();
            
        } catch (error) {
            console.error('❌ Error loading filters:', error);
            this.filters = [];
            this.showToast('Error loading filters: ' + error.message, 'error');
        }
    },
    
    renderCategoryTabs() {
        const container = document.getElementById('categoryTabs');
        if (!container) return;
        
        let html = '<button class="category-tab active" data-category="all">All Filters</button>';
        
        this.filterCategories.forEach(cat => {
            html += `
                <button class="category-tab" data-category="${cat.id}">
                    <i class="fas ${cat.icon || 'fa-filter'}" style="color: ${cat.color_hex};"></i>
                    ${cat.display_name}
                </button>
            `;
        });
        
        container.innerHTML = html;
        
        // Add click handlers
        container.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                container.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.filterByCategory(tab.dataset.category);
            });
        });
    },
    
    filterByCategory(categoryId) {
        const filtered = categoryId === 'all' 
            ? this.filters 
            : this.filters.filter(f => f.filter_category_id == categoryId);
        
        this.renderFilters(filtered);
    },
    
    renderFilters(filters = this.filters) {
        const container = document.getElementById('filtersGrid');
        if (!container) return;
        
        if (!filters || filters.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-filter"></i>
                    <h3>No filters found</h3>
                    <p>Create your first filter to help users refine their search</p>
                    <p class="text-muted" style="font-size: 12px; margin-top: 8px;">
                        Make sure you've created filter categories and types first.
                    </p>
                    <button class="add-filter-btn" onclick="AdminFilters.openFilterModal()">
                        <i class="fas fa-plus"></i> Create Filter
                    </button>
                </div>
            `;
            return;
        }
        
        const html = filters.map(filter => {
            const category = filter.filter_category || {};
            const type = filter.filter_type || {};
            const options = filter.filter_options || [];
            
            const appearsIn = [];
            if (filter.appears_in_carousel) appearsIn.push('<span class="badge carousel">Carousel</span>');
            if (filter.appears_in_sidebar) appearsIn.push('<span class="badge sidebar">Sidebar</span>');
            if (filter.appears_in_modal) appearsIn.push('<span class="badge modal">Modal</span>');
            
            const statusClass = filter.is_active ? 'active' : '';
            
            return `
                <div class="filter-card" data-filter-id="${filter.id}">
                    <div class="filter-header">
                        <div class="filter-icon" style="background: ${filter.color_hex}20; color: ${filter.color_hex};">
                            <i class="fas ${filter.icon || 'fa-filter'}"></i>
                        </div>
                        <div class="filter-info">
                            <div class="filter-name">${this.escapeHtml(filter.display_name)}</div>
                            <div class="filter-category">
                                <i class="fas ${category.icon || 'fa-tag'}"></i>
                                ${this.escapeHtml(category.display_name || 'Uncategorized')}
                            </div>
                        </div>
                        <div class="filter-actions">
                            <button class="filter-action-btn" onclick="AdminFilters.editFilter(${filter.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="filter-action-btn" onclick="AdminFilters.deleteFilter(${filter.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="filter-details">
                        <div class="detail-row">
                            <span class="detail-label">Type:</span>
                            <span class="detail-value">${this.escapeHtml(type.display_name || 'Unknown')}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Database:</span>
                            <span class="detail-value">${filter.table_name}.${filter.column_name}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Display:</span>
                            <span class="detail-value">${appearsIn.join(' ') || 'None'}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Status:</span>
                            <div class="status-toggle ${statusClass}" onclick="AdminFilters.toggleFilterStatus(${filter.id})">
                                <input type="hidden" value="${filter.is_active}">
                            </div>
                        </div>
                        
                        ${options.length > 0 ? `
                            <div class="filter-options-list">
                                ${options.map(opt => `
                                    <div class="option-item">
                                        <div class="option-value">
                                            <span class="option-color" style="background: ${opt.color_hex || '#6B21E5'};"></span>
                                            <span>${this.escapeHtml(opt.label)}</span>
                                        </div>
                                        <span class="detail-value">${opt.value}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    },
    
    populateFilterForm() {
        // Populate filter categories
        const categorySelect = document.getElementById('filterCategory');
        if (categorySelect) {
            categorySelect.innerHTML = this.filterCategories.map(cat => 
                `<option value="${cat.id}">${cat.display_name}</option>`
            ).join('');
        }
        
        // Populate filter types
        const typeSelect = document.getElementById('filterType');
        if (typeSelect) {
            typeSelect.innerHTML = this.filterTypes.map(type => 
                `<option value="${type.id}" data-name="${type.name}">${type.display_name}</option>`
            ).join('');
        }
        
        // Load categories for checkboxes
        this.loadCategoriesForCheckboxes();
    },
    
    async loadCategoriesForCheckboxes() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id, name, display_name')
                .eq('is_active', true)
                .order('display_order');
                
            if (error) throw error;
            
            const categoryCheckboxes = document.getElementById('categoryCheckboxes');
            if (categoryCheckboxes) {
                categoryCheckboxes.innerHTML = (data || []).map(cat => `
                    <label class="filter-checkbox">
                        <input type="checkbox" value="${cat.id}">
                        <span>${this.escapeHtml(cat.display_name || cat.name)}</span>
                    </label>
                `).join('');
            }
            
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },
    
    toggleFilterStatus(filterId) {
        const filter = this.filters.find(f => f.id == filterId);
        if (!filter) return;
        
        this.updateFilter(filterId, { is_active: !filter.is_active });
    },
    
    async updateFilter(filterId, updates) {
        try {
            const { error } = await sb
                .from('filters')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', filterId);
                
            if (error) throw error;
            
            // Update local state
            const filter = this.filters.find(f => f.id == filterId);
            if (filter) {
                Object.assign(filter, updates);
            }
            
            // Refresh filters from view
            await this.loadFilters();
            this.showToast('Filter updated successfully', 'success');
            
        } catch (error) {
            console.error('Error updating filter:', error);
            this.showToast('Error updating filter', 'error');
        }
    },
    
    openFilterModal(filterId = null) {
        this.currentFilterId = filterId;
        
        const modal = document.getElementById('filterModal');
        const title = document.getElementById('modalTitle');
        
        if (filterId) {
            title.textContent = 'Edit Filter';
            this.loadFilterIntoForm(filterId);
        } else {
            title.textContent = 'Add New Filter';
            this.resetForm();
        }
        
        modal.classList.add('show');
    },
    
    closeFilterModal() {
        document.getElementById('filterModal').classList.remove('show');
        this.currentFilterId = null;
    },
    
    resetForm() {
        document.getElementById('filterForm').reset();
        document.getElementById('filterColor').value = '#6B21E5';
        
        // Set default toggles
        this.setToggleValue('appearsInCarousel', true);
        this.setToggleValue('appearsInSidebar', true);
        this.setToggleValue('appearsInModal', true);
        this.setToggleValue('isCollapsible', true);
        this.setToggleValue('showSearch', false);
        
        // Reset options
        document.getElementById('optionsContainer').innerHTML = `
            <div class="option-row">
                <input type="text" class="option-value" placeholder="Value (e.g., new)">
                <input type="text" class="option-label" placeholder="Label (e.g., New)">
                <input type="color" class="color-input" value="#6B21E5">
                <i class="fas fa-trash remove-option" onclick="AdminFilters.removeOption(this)"></i>
            </div>
        `;
        
        // Hide conditional sections
        document.getElementById('rangeSettings').style.display = 'none';
        document.getElementById('optionsSettings').style.display = 'none';
    },
    
    async loadFilterIntoForm(filterId) {
        const filter = this.filters.find(f => f.id == filterId);
        if (!filter) return;
        
        document.getElementById('filterName').value = filter.name || '';
        document.getElementById('filterDisplayName').value = filter.display_name || '';
        document.getElementById('filterDescription').value = filter.description || '';
        document.getElementById('filterCategory').value = filter.filter_category_id || '';
        document.getElementById('filterType').value = filter.filter_type_id || '';
        document.getElementById('tableName').value = filter.table_name || 'ads';
        document.getElementById('columnName').value = filter.column_name || '';
        document.getElementById('dataType').value = filter.data_type || 'text';
        document.getElementById('filterIcon').value = filter.icon || 'fa-filter';
        document.getElementById('filterColor').value = filter.color_hex || '#6B21E5';
        document.getElementById('displayOrder').value = filter.display_order || 0;
        
        // Set toggles
        this.setToggleValue('appearsInCarousel', filter.appears_in_carousel);
        this.setToggleValue('appearsInSidebar', filter.appears_in_sidebar);
        this.setToggleValue('appearsInModal', filter.appears_in_modal);
        this.setToggleValue('isCollapsible', filter.is_collapsible);
        this.setToggleValue('showSearch', filter.show_search);
        
        // Range settings
        if (filter.min_value) document.getElementById('minValue').value = filter.min_value;
        if (filter.max_value) document.getElementById('maxValue').value = filter.max_value;
        if (filter.step_value) document.getElementById('stepValue').value = filter.step_value;
        
        // Options
        if (filter.filter_options && filter.filter_options.length > 0) {
            const container = document.getElementById('optionsContainer');
            container.innerHTML = filter.filter_options.map(opt => `
                <div class="option-row">
                    <input type="text" class="option-value" value="${opt.value}" placeholder="Value">
                    <input type="text" class="option-label" value="${opt.label}" placeholder="Label">
                    <input type="color" class="color-input" value="${opt.color_hex || '#6B21E5'}">
                    <i class="fas fa-trash remove-option" onclick="AdminFilters.removeOption(this)"></i>
                </div>
            `).join('');
        }
        
        // Show appropriate sections based on filter type
        this.toggleFilterOptions();
        
        // Load category associations (you'll need to implement this separately)
        await this.loadCategoryAssociations(filterId);
    },
    
    async loadCategoryAssociations(filterId) {
        try {
            const { data, error } = await sb
                .from('category_filters')
                .select('category_id')
                .eq('filter_id', filterId);
                
            if (error) throw error;
            
            const associatedCategoryIds = new Set((data || []).map(cf => cf.category_id));
            
            document.querySelectorAll('#categoryCheckboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = associatedCategoryIds.has(parseInt(cb.value));
            });
            
        } catch (error) {
            console.error('Error loading category associations:', error);
        }
    },
    
    setToggleValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const input = element.querySelector('input');
        if (input) {
            input.value = value ? 'true' : 'false';
        }
        
        if (value) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    },
    
    toggleFilterOptions() {
        const typeSelect = document.getElementById('filterType');
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        const typeName = selectedOption ? selectedOption.dataset.name : '';
        
        const rangeSettings = document.getElementById('rangeSettings');
        const optionsSettings = document.getElementById('optionsSettings');
        
        if (['range', 'slider'].includes(typeName)) {
            rangeSettings.style.display = 'block';
            optionsSettings.style.display = 'none';
        } else if (['checkbox', 'radio', 'dropdown', 'multiselect'].includes(typeName)) {
            rangeSettings.style.display = 'none';
            optionsSettings.style.display = 'block';
        } else {
            rangeSettings.style.display = 'none';
            optionsSettings.style.display = 'none';
        }
    },
    
    addOption() {
        const container = document.getElementById('optionsContainer');
        const optionRow = document.createElement('div');
        optionRow.className = 'option-row';
        optionRow.innerHTML = `
            <input type="text" class="option-value" placeholder="Value">
            <input type="text" class="option-label" placeholder="Label">
            <input type="color" class="color-input" value="#6B21E5">
            <i class="fas fa-trash remove-option" onclick="AdminFilters.removeOption(this)"></i>
        `;
        container.appendChild(optionRow);
    },
    
    removeOption(element) {
        const container = document.getElementById('optionsContainer');
        if (container.children.length > 1) {
            element.closest('.option-row').remove();
        } else {
            this.showToast('At least one option is required', 'warning');
        }
    },
    
    async saveFilter() {
        const filterData = {
            name: document.getElementById('filterName').value,
            display_name: document.getElementById('filterDisplayName').value,
            description: document.getElementById('filterDescription').value,
            filter_category_id: parseInt(document.getElementById('filterCategory').value) || null,
            filter_type_id: parseInt(document.getElementById('filterType').value) || null,
            table_name: document.getElementById('tableName').value,
            column_name: document.getElementById('columnName').value,
            data_type: document.getElementById('dataType').value,
            icon: document.getElementById('filterIcon').value,
            color_hex: document.getElementById('filterColor').value,
            display_order: parseInt(document.getElementById('displayOrder').value) || 0,
            appears_in_carousel: document.querySelector('#appearsInCarousel input')?.value === 'true',
            appears_in_sidebar: document.querySelector('#appearsInSidebar input')?.value === 'true',
            appears_in_modal: document.querySelector('#appearsInModal input')?.value === 'true',
            is_collapsible: document.querySelector('#isCollapsible input')?.value === 'true',
            show_search: document.querySelector('#showSearch input')?.value === 'true',
            is_active: true,
            updated_at: new Date().toISOString()
        };
        
        // Validate required fields
        if (!filterData.name || !filterData.display_name || !filterData.table_name || !filterData.column_name) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        // Add range data if applicable
        const typeSelect = document.getElementById('filterType');
        const typeName = typeSelect.options[typeSelect.selectedIndex]?.dataset.name;
        
        if (['range', 'slider'].includes(typeName)) {
            filterData.min_value = parseFloat(document.getElementById('minValue').value) || null;
            filterData.max_value = parseFloat(document.getElementById('maxValue').value) || null;
            filterData.step_value = parseFloat(document.getElementById('stepValue').value) || 1;
        }
        
        this.showLoading(true, 'Saving filter...');
        
        try {
            let filterId;
            
            if (this.currentFilterId) {
                // Update existing filter
                const { error } = await sb
                    .from('filters')
                    .update(filterData)
                    .eq('id', this.currentFilterId);
                    
                if (error) throw error;
                filterId = this.currentFilterId;
                this.showToast('Filter updated successfully', 'success');
                
            } else {
                // Create new filter
                const { data, error } = await sb
                    .from('filters')
                    .insert([{ ...filterData, created_by: this.currentUser?.id }])
                    .select();
                    
                if (error) throw error;
                filterId = data[0].id;
                this.showToast('Filter created successfully', 'success');
            }
            
            // Save options if applicable
            if (['checkbox', 'radio', 'dropdown', 'multiselect'].includes(typeName)) {
                await this.saveFilterOptions(filterId);
            }
            
            // Save category associations
            await this.saveCategoryAssociations(filterId);
            
            // Reload data
            await this.loadFilters();
            this.closeFilterModal();
            
        } catch (error) {
            console.error('Error saving filter:', error);
            this.showToast('Error saving filter: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    async saveFilterOptions(filterId) {
        // First delete existing options
        await sb.from('filter_options').delete().eq('filter_id', filterId);
        
        // Get all option rows
        const optionRows = document.querySelectorAll('#optionsContainer .option-row');
        const options = [];
        
        optionRows.forEach((row, index) => {
            const value = row.querySelector('.option-value')?.value;
            const label = row.querySelector('.option-label')?.value;
            const color = row.querySelector('.color-input')?.value;
            
            if (value && label) {
                options.push({
                    filter_id: filterId,
                    value,
                    label,
                    color_hex: color || '#6B21E5',
                    display_order: index
                });
            }
        });
        
        if (options.length > 0) {
            const { error } = await sb.from('filter_options').insert(options);
            if (error) throw error;
        }
    },
    
    async saveCategoryAssociations(filterId) {
        // First delete existing associations
        await sb.from('category_filters').delete().eq('filter_id', filterId);
        
        // Get checked categories
        const checkedCategories = [];
        document.querySelectorAll('#categoryCheckboxes input:checked').forEach(cb => {
            checkedCategories.push({
                category_id: parseInt(cb.value),
                filter_id: filterId,
                display_order: 0
            });
        });
        
        if (checkedCategories.length > 0) {
            const { error } = await sb.from('category_filters').insert(checkedCategories);
            if (error) throw error;
        }
    },
    
    deleteFilter(filterId) {
        this.currentFilterId = filterId;
        document.getElementById('deleteModal').classList.add('show');
    },
    
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        this.currentFilterId = null;
    },
    
    async confirmDelete() {
        if (!this.currentFilterId) return;
        
        this.showLoading(true, 'Deleting filter...');
        
        try {
            // Delete options first (foreign key constraints)
            await sb.from('filter_options').delete().eq('filter_id', this.currentFilterId);
            
            // Delete category associations
            await sb.from('category_filters').delete().eq('filter_id', this.currentFilterId);
            
            // Delete filter
            const { error } = await sb
                .from('filters')
                .delete()
                .eq('id', this.currentFilterId);
                
            if (error) throw error;
            
            this.showToast('Filter deleted successfully', 'success');
            
            // Reload data
            await this.loadFilters();
            this.closeDeleteModal();
            
        } catch (error) {
            console.error('Error deleting filter:', error);
            this.showToast('Error deleting filter', 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    editFilter(filterId) {
        this.openFilterModal(filterId);
    },
    
    setupEventListeners() {
        // Menu toggle
        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                document.getElementById('adminSidebar').classList.toggle('collapsed');
                document.getElementById('adminMain').classList.toggle('expanded');
            });
        }
        
        // Add filter button
        const addFilterBtn = document.getElementById('addFilterBtn');
        if (addFilterBtn) {
            addFilterBtn.addEventListener('click', () => {
                this.openFilterModal();
            });
        }
        
        // Confirm delete button
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                this.confirmDelete();
            });
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await sb.auth.signOut();
                window.location.href = 'admin-login.html';
            });
        }
        
        // Close modals on overlay click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeFilterModal();
                this.closeDeleteModal();
            }
        });
        
        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeFilterModal();
                this.closeDeleteModal();
            }
        });
    },
    
    showLoading(show, message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = overlay.querySelector('p');
        if (messageEl) messageEl.textContent = message;
        overlay.style.display = show ? 'flex' : 'none';
    },
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#6B21E5',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type];
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Global toggle function
window.toggleStatus = function(element) {
    const input = element.querySelector('input');
    if (input) {
        const newValue = input.value === 'true' ? 'false' : 'true';
        input.value = newValue;
        
        if (newValue === 'true') {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.AdminFilters = AdminFilters;
    AdminFilters.init();
});

// Make functions globally available
window.openFilterModal = (id) => AdminFilters.openFilterModal(id);
window.closeFilterModal = () => AdminFilters.closeFilterModal();
window.saveFilter = () => AdminFilters.saveFilter();
window.toggleFilterOptions = () => AdminFilters.toggleFilterOptions();
window.addOption = () => AdminFilters.addOption();
window.removeOption = (el) => AdminFilters.removeOption(el);
window.closeDeleteModal = () => AdminFilters.closeDeleteModal();