// ============================================
// SUPPLIER PRODUCTS MANAGEMENT - WITH PAGE NAVIGATION
// ============================================

console.log('🚀 Supplier Products loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let SupplierProducts = {
    currentUser: null,
    supplier: null,
    products: [],
    filteredProducts: [],
    categories: [],
    subcategories: [],
    currentPage: 1,
    itemsPerPage: 12,
    hasMore: true,
    isLoading: false,
    currentProduct: null,
    currentFilter: 'all',
    searchTerm: '',
    filters: {
        categories: [],
        minPrice: null,
        maxPrice: null,
        stockStatus: 'all'
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Products initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadCategories();
            await this.loadProducts();
            this.setupEventListeners();
            
            console.log('✅ Supplier Products initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading products', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-products.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('*')
                .eq('profile_id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            
            this.supplier = data;
            console.log('✅ Supplier loaded:', this.supplier.business_name);
            
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.showToast('Error loading supplier data', 'error');
            setTimeout(() => window.location.href = 'supplier-register.html', 2000);
        }
    },
    
    async loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('*')
                .eq('is_active', true)
                .order('name');
            
            if (error) throw error;
            
            this.categories = data || [];
            
            // Populate category filters
            const filterContainer = document.getElementById('categoryFilters');
            if (filterContainer) {
                filterContainer.innerHTML = this.categories.filter(c => !c.parent_id).map(c => `
                    <label class="filter-option">
                        <input type="checkbox" value="${c.id}" class="category-filter">
                        <span>${c.display_name || c.name}</span>
                    </label>
                `).join('');
            }
            
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },
    
    // ============================================
    // NAVIGATION TO ADD/EDIT PRODUCTS
    // ============================================
    goToAddProduct() {
        window.location.href = 'supplier-add-product.html';
    },
    
    goToEditProduct(productId) {
        window.location.href = `supplier-add-product.html?edit=${productId}`;
    },
    
    // ============================================
    // LOAD PRODUCTS
    // ============================================
    async loadProducts(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
        this.isLoading = true;
        
        const loadingEl = document.getElementById('loadingState');
        const productsGrid = document.getElementById('productsGrid');
        const emptyEl = document.getElementById('emptyState');
        const loadMoreEl = document.getElementById('loadMore');
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            
            if (loadingEl) loadingEl.style.display = 'block';
            if (productsGrid) productsGrid.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'none';
            if (loadMoreEl) loadMoreEl.style.display = 'none';
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            let query = sb
                .from('ads')
                .select(`
                    *,
                    category:categories!ads_category_id_fkey (id, name, display_name),
                    subcategory:categories!ads_subcategory_id_fkey (id, name, display_name)
                `)
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
            
            // Apply status filter
            if (this.currentFilter === 'active') {
                query = query.eq('status', 'active');
            } else if (this.currentFilter === 'draft') {
                query = query.eq('status', 'draft');
            } else if (this.currentFilter === 'lowstock') {
                query = query.lt('stock_quantity', 10).gt('stock_quantity', 0);
            }
            
            // Apply search
            if (this.searchTerm) {
                query = query.or(`title.ilike.%${this.searchTerm}%,description.ilike.%${this.searchTerm}%,sku.ilike.%${this.searchTerm}%`);
            }
            
            // Apply category filters
            if (this.filters.categories && this.filters.categories.length > 0) {
                query = query.in('category_id', this.filters.categories);
            }
            
            // Apply price filters
            if (this.filters.minPrice) {
                query = query.gte('price', this.filters.minPrice);
            }
            if (this.filters.maxPrice) {
                query = query.lte('price', this.filters.maxPrice);
            }
            
            // Apply stock status
            if (this.filters.stockStatus === 'in_stock') {
                query = query.gt('stock_quantity', 10);
            } else if (this.filters.stockStatus === 'low_stock') {
                query = query.lt('stock_quantity', 10).gt('stock_quantity', 0);
            } else if (this.filters.stockStatus === 'out_of_stock') {
                query = query.eq('stock_quantity', 0);
            }
            
            const { data, error } = await query.range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.products = data || [];
            } else {
                this.products = [...this.products, ...(data || [])];
            }
            
            this.filteredProducts = [...this.products];
            this.hasMore = (data || []).length === this.itemsPerPage;
            
            this.updateStats();
            this.renderProducts();
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = this.filteredProducts.length === 0 ? 'block' : 'none';
            if (loadMoreEl) loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
            
        } catch (error) {
            console.error('Error loading products:', error);
            this.showToast('Error loading products', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // UPDATE STATS
    // ============================================
    updateStats() {
        const total = this.products.length;
        const active = this.products.filter(p => p.status === 'active').length;
        const lowStock = this.products.filter(p => p.stock_quantity < 10 && p.stock_quantity > 0).length;
        const categories = new Set(this.products.map(p => p.category_id)).size;
        
        const totalEl = document.getElementById('totalProducts');
        const activeEl = document.getElementById('activeProducts');
        const lowStockEl = document.getElementById('lowStockProducts');
        const categoriesEl = document.getElementById('totalCategories');
        
        if (totalEl) totalEl.textContent = total;
        if (activeEl) activeEl.textContent = active;
        if (lowStockEl) lowStockEl.textContent = lowStock;
        if (categoriesEl) categoriesEl.textContent = categories;
    },
    
    // ============================================
    // RENDER PRODUCTS
    // ============================================
    renderProducts() {
        const container = document.getElementById('productsGrid');
        if (!container) return;
        
        if (this.filteredProducts.length === 0) return;
        
        container.innerHTML = this.filteredProducts.map(product => this.renderProductCard(product)).join('');
    },
    
    renderProductCard(product) {
        const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/300x200?text=No+Image';
        const price = product.wholesale_price || product.price || 0;
        const status = product.status || 'draft';
        const isLowStock = product.stock_quantity < 10 && product.stock_quantity > 0;
        const categoryName = product.category?.display_name || product.category?.name || 'Uncategorized';
        
        return `
            <div class="product-card ${status} ${isLowStock ? 'low-stock' : ''}" data-product-id="${product.id}" onclick="SupplierProducts.viewProduct(${product.id})">
                <div class="product-image">
                    <img src="${imageUrl}" alt="${this.escapeHtml(product.title)}" loading="lazy">
                    ${status === 'draft' ? '<span class="product-badge draft">Draft</span>' : ''}
                    ${isLowStock ? '<span class="product-badge low-stock">Low Stock</span>' : ''}
                </div>
                <div class="product-info">
                    <span class="product-category">${this.escapeHtml(categoryName)}</span>
                    <h3 class="product-title">${this.escapeHtml(product.title)}</h3>
                    <div class="product-price">UGX ${this.formatNumber(price)}</div>
                    <div class="product-meta">
                        <span><i class="fas fa-box"></i> ${product.stock_quantity || 0} in stock</span>
                        <span><i class="fas fa-eye"></i> ${product.view_count || 0}</span>
                    </div>
                    <div class="product-footer">
                        <div class="product-views">
                            <i class="far fa-clock"></i> ${this.formatDate(product.created_at)}
                        </div>
                        <div class="product-actions" onclick="event.stopPropagation()">
                            <button class="btn-icon" onclick="SupplierProducts.goToEditProduct(${product.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="SupplierProducts.duplicateProduct(${product.id})" title="Duplicate">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="btn-icon" onclick="SupplierProducts.toggleStatus(${product.id})" title="${status === 'active' ? 'Deactivate' : 'Activate'}">
                                <i class="fas ${status === 'active' ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="SupplierProducts.deleteProduct(${product.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // PRODUCT CRUD OPERATIONS
    // ============================================
    async viewProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        this.currentProduct = product;
        
        const modalBody = document.getElementById('viewProductBody');
        const categoryName = product.category?.display_name || product.category?.name || 'Uncategorized';
        const subcategoryName = product.subcategory?.display_name || product.subcategory?.name;
        const images = product.image_urls || [];
        
        if (modalBody) {
            modalBody.innerHTML = `
                ${images.length > 0 ? `
                    <div class="view-product-images">
                        ${images.slice(0, 4).map(url => `
                            <div class="view-product-image">
                                <img src="${url}" alt="${product.title}">
                            </div>
                        `).join('')}
                        ${images.length > 4 ? `<div class="view-product-image">+${images.length - 4} more</div>` : ''}
                    </div>
                ` : ''}
                
                <h2 style="margin-bottom: 8px;">${this.escapeHtml(product.title)}</h2>
                <p style="color: var(--gray-600); margin-bottom: 16px;">SKU: ${product.sku || 'N/A'}</p>
                
                <div class="view-product-meta">
                    <div class="meta-item">
                        <span class="meta-label">Category</span>
                        <span class="meta-value">${this.escapeHtml(categoryName)}${subcategoryName ? ` → ${this.escapeHtml(subcategoryName)}` : ''}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Price</span>
                        <span class="meta-value">UGX ${this.formatNumber(product.price)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Wholesale</span>
                        <span class="meta-value">${product.wholesale_price ? 'UGX ' + this.formatNumber(product.wholesale_price) : 'Not set'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Stock</span>
                        <span class="meta-value">${product.stock_quantity || 0} units</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">MOQ</span>
                        <span class="meta-value">${product.moq || 1} units</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Lead Time</span>
                        <span class="meta-value">${product.lead_time_days || 3} days</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Location</span>
                        <span class="meta-value">${product.district || 'Kampala'}, ${product.region || 'Central'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Status</span>
                        <span class="meta-value">${product.status || 'draft'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Views</span>
                        <span class="meta-value">${product.view_count || 0}</span>
                    </div>
                </div>
                
                <h3 style="margin: 20px 0 10px;">Description</h3>
                <div class="view-product-description">
                    ${product.description || 'No description provided.'}
                </div>
                
                ${product.bulk_pricing && product.bulk_pricing.length > 0 ? `
                    <h3 style="margin: 20px 0 10px;">Bulk Pricing Tiers</h3>
                    <table class="bulk-tiers-table">
                        <thead>
                            <tr>
                                <th>Min Quantity</th>
                                <th>Max Quantity</th>
                                <th>Price per Unit</th>
                                <th>Discount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${product.bulk_pricing.map(tier => `
                                <tr>
                                    <td>${tier.min_quantity}</td>
                                    <td>${tier.max_quantity || '∞'}</td>
                                    <td>UGX ${this.formatNumber(tier.price_per_unit)}</td>
                                    <td>${tier.discount_percentage || 0}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : ''}
                
                ${product.tags && product.tags.length > 0 ? `
                    <div style="margin-top: 20px;">
                        ${product.tags.map(tag => `<span style="background: var(--gray-100); padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-right: 8px;">#${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            `;
        }
        
        const viewTitle = document.getElementById('viewProductTitle');
        if (viewTitle) viewTitle.textContent = product.title;
        
        const viewModal = document.getElementById('viewProductModal');
        if (viewModal) viewModal.classList.add('show');
    },
    
    editFromView() {
        this.closeViewModal();
        if (this.currentProduct) {
            this.goToEditProduct(this.currentProduct.id);
        }
    },
    
    async duplicateProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        this.showToast('Opening product editor with copy...', 'info');
        
        // Store product data in sessionStorage for pre-filling the add form
        const productCopy = {
            title: `${product.title} (Copy)`,
            description: product.description,
            category_id: product.category_id,
            subcategory_id: product.subcategory_id,
            price: product.price,
            wholesale_price: product.wholesale_price,
            stock_quantity: product.stock_quantity,
            moq: product.moq,
            lead_time_days: product.lead_time_days,
            sku: product.sku ? `${product.sku}-COPY` : null,
            brand: product.brand,
            model: product.model,
            condition: product.condition,
            tags: product.tags,
            region: product.region,
            district: product.district,
            specific_location: product.specific_location,
            is_negotiable: product.is_negotiable,
            is_bulk_only: product.is_bulk_only
        };
        
        sessionStorage.setItem('duplicateProduct', JSON.stringify(productCopy));
        window.location.href = 'supplier-add-product.html?duplicate=true';
    },
    
    async toggleStatus(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        const newStatus = product.status === 'active' ? 'draft' : 'active';
        
        try {
            const { error } = await sb
                .from('ads')
                .update({ 
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', productId);
            
            if (error) throw error;
            
            this.showToast(`Product ${newStatus === 'active' ? 'activated' : 'deactivated'}`, 'success');
            await this.loadProducts(true);
            
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showToast('Error updating product', 'error');
        }
    },
    
    deleteProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        this.currentProduct = product;
        const deleteName = document.getElementById('deleteProductName');
        if (deleteName) deleteName.textContent = product.title;
        
        const deleteModal = document.getElementById('deleteModal');
        if (deleteModal) deleteModal.classList.add('show');
    },
    
    async confirmDelete() {
        if (!this.currentProduct) return;
        
        try {
            const { error } = await sb
                .from('ads')
                .delete()
                .eq('id', this.currentProduct.id);
            
            if (error) throw error;
            
            this.closeDeleteModal();
            this.showToast('Product deleted successfully', 'success');
            await this.loadProducts(true);
            
        } catch (error) {
            console.error('Error deleting product:', error);
            this.showToast('Error deleting product', 'error');
        }
    },
    
    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    filterProducts(filter) {
        this.currentFilter = filter;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.loadProducts(true);
    },
    
    applyFilters() {
        const selectedCategories = [];
        document.querySelectorAll('.category-filter:checked').forEach(cb => {
            selectedCategories.push(parseInt(cb.value));
        });
        
        this.filters = {
            categories: selectedCategories,
            minPrice: parseFloat(document.getElementById('minPrice')?.value) || null,
            maxPrice: parseFloat(document.getElementById('maxPrice')?.value) || null,
            stockStatus: document.getElementById('stockStatus')?.value || 'all'
        };
        
        this.loadProducts(true);
        this.closeFilterPanel();
    },
    
    resetFilters() {
        document.querySelectorAll('.category-filter').forEach(cb => cb.checked = false);
        
        const minPrice = document.getElementById('minPrice');
        const maxPrice = document.getElementById('maxPrice');
        const stockStatus = document.getElementById('stockStatus');
        
        if (minPrice) minPrice.value = '';
        if (maxPrice) maxPrice.value = '';
        if (stockStatus) stockStatus.value = 'all';
        
        this.filters = {
            categories: [],
            minPrice: null,
            maxPrice: null,
            stockStatus: 'all'
        };
        
        this.loadProducts(true);
        this.closeFilterPanel();
    },
    
    handleSearch() {
        const searchInput = document.getElementById('searchInput');
        this.searchTerm = searchInput ? searchInput.value : '';
        this.loadProducts(true);
    },
    
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    },
    
    closeFilterPanel() {
        const panel = document.getElementById('filterPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    },
    
    loadMoreProducts() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadProducts(false);
    },
    
    // ============================================
    // EXPORT
    // ============================================
    exportProducts() {
        const data = this.products.map(p => ({
            id: p.id,
            title: p.title,
            price: p.price,
            wholesale_price: p.wholesale_price,
            stock: p.stock_quantity,
            status: p.status,
            views: p.view_count,
            created_at: p.created_at
        }));
        
        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `products_${new Date().toISOString().split('T')[0]}.csv`);
        this.showToast('Products exported', 'success');
    },
    
    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(obj => Object.values(obj).join(','));
        return [headers, ...rows].join('\n');
    },
    
    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeViewModal() {
        const modal = document.getElementById('viewProductModal');
        if (modal) modal.classList.remove('show');
    },
    
    closeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) modal.classList.remove('show');
        this.currentProduct = null;
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },
    
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
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Search with debounce
        let searchTimeout;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.handleSearch(), 500);
            });
        }
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterProducts(filter);
            });
        });
        
        // Filter panel toggle
        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.toggleFilterPanel();
            });
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeViewModal();
                    this.closeDeleteModal();
                }
            });
        });
        
        // Confirm delete
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.confirmDelete();
            });
        }
        
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeViewModal();
                this.closeDeleteModal();
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierProducts.init();
});

// Global functions
window.SupplierProducts = SupplierProducts;
window.goToAddProduct = () => SupplierProducts.goToAddProduct();
window.goToEditProduct = (id) => SupplierProducts.goToEditProduct(id);
window.closeViewModal = () => SupplierProducts.closeViewModal();
window.closeDeleteModal = () => SupplierProducts.closeDeleteModal();
window.applyFilters = () => SupplierProducts.applyFilters();
window.resetFilters = () => SupplierProducts.resetFilters();
window.loadMoreProducts = () => SupplierProducts.loadMoreProducts();
window.exportProducts = () => SupplierProducts.exportProducts();
