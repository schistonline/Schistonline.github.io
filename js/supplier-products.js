// ============================================
// SUPPLIER PRODUCTS MANAGEMENT - COMPLETE FIXED
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
    selectedFiles: [],
    bulkTiers: [],
    imageUrls: [],
    
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
            
            // Populate category dropdown
            const categorySelect = document.getElementById('productCategory');
            if (categorySelect) {
                categorySelect.innerHTML = '<option value="">Select category</option>' + 
                    this.categories.map(c => `<option value="${c.id}">${c.display_name || c.name}</option>`).join('');
            }
            
            // Populate category filters
            const filterContainer = document.getElementById('categoryFilters');
            if (filterContainer) {
                filterContainer.innerHTML = this.categories.map(c => `
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
    
    async loadSubcategories(categoryId) {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('*')
                .eq('parent_id', categoryId)
                .eq('is_active', true)
                .order('name');
            
            if (error) throw error;
            
            this.subcategories = data || [];
            
            const subcatSelect = document.getElementById('productSubcategory');
            if (subcatSelect) {
                subcatSelect.innerHTML = '<option value="">Select subcategory</option>' + 
                    this.subcategories.map(c => `<option value="${c.id}">${c.display_name || c.name}</option>`).join('');
            }
            
        } catch (error) {
            console.error('Error loading subcategories:', error);
        }
    },
    
    // ============================================
    // LOAD PRODUCTS - FIXED WITH NULL CHECKS
    // ============================================
    async loadProducts(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
        this.isLoading = true;
        
        // Safely get DOM elements with null checks
        const loadingEl = document.getElementById('loadingState');
        const productsGrid = document.getElementById('productsGrid');
        const emptyEl = document.getElementById('emptyState');
        const loadMoreEl = document.getElementById('loadMore');
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            
            // Only access style if elements exist
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
            
            // Hide loading state
            if (loadingEl) loadingEl.style.display = 'none';
            
            // Show/hide empty state
            if (emptyEl) {
                emptyEl.style.display = this.filteredProducts.length === 0 ? 'block' : 'none';
            }
            
            // Show/hide load more button
            if (loadMoreEl) {
                loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
            }
            
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
                            <button class="btn-icon" onclick="SupplierProducts.editProduct(${product.id})" title="Edit">
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
    openProductModal(product = null) {
        this.resetForm();
        
        if (product) {
            // Edit mode
            this.currentProduct = product;
            document.getElementById('modalTitle').textContent = 'Edit Product';
            document.getElementById('productId').value = product.id;
            document.getElementById('productTitle').value = product.title || '';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productCategory').value = product.category_id || '';
            document.getElementById('productSubcategory').value = product.subcategory_id || '';
            document.getElementById('productSku').value = product.sku || '';
            document.getElementById('productBrand').value = product.brand || '';
            document.getElementById('productModel').value = product.model || '';
            document.getElementById('productCondition').value = product.condition || 'new';
            document.getElementById('productTags').value = (product.tags || []).join(', ');
            document.getElementById('regularPrice').value = product.price || '';
            document.getElementById('wholesalePrice').value = product.wholesale_price || '';
            document.getElementById('stockQuantity').value = product.stock_quantity || 0;
            document.getElementById('lowStockThreshold').value = product.low_stock_threshold || 10;
            document.getElementById('moq').value = product.moq || 1;
            document.getElementById('maxOrderQty').value = product.max_order_quantity || '';
            document.getElementById('leadTime').value = product.lead_time_days || 3;
            document.getElementById('region').value = product.region || 'Central';
            document.getElementById('district').value = product.district || 'Kampala';
            document.getElementById('specificLocation').value = product.specific_location || '';
            document.getElementById('metaTitle').value = product.meta_title || '';
            document.getElementById('metaDescription').value = product.meta_description || '';
            document.getElementById('isActive').checked = product.status === 'active';
            document.getElementById('isBulkOnly').checked = product.is_bulk_only || false;
            document.getElementById('isNegotiable').checked = product.is_negotiable || false;
            
            // Load subcategories
            if (product.category_id) {
                this.loadSubcategories(product.category_id);
            }
            
            // Load images
            if (product.image_urls && product.image_urls.length > 0) {
                this.imageUrls = product.image_urls;
                this.renderImageList();
            }
            
            // Load bulk pricing tiers
            if (product.bulk_pricing) {
                this.bulkTiers = product.bulk_pricing;
                this.renderBulkTiers();
            }
            
        } else {
            // Create mode
            this.currentProduct = null;
            document.getElementById('modalTitle').textContent = 'Add New Product';
        }
        
        document.getElementById('productModal').classList.add('show');
    },
    
    closeProductModal() {
        document.getElementById('productModal').classList.remove('show');
        this.resetForm();
    },
    
    resetForm() {
        const form = document.getElementById('productForm');
        if (form) form.reset();
        
        const productId = document.getElementById('productId');
        if (productId) productId.value = '';
        
        const imageUrls = document.getElementById('imageUrls');
        if (imageUrls) imageUrls.value = '[]';
        
        this.imageUrls = [];
        this.bulkTiers = [];
        this.selectedFiles = [];
        
        const imageList = document.getElementById('imageList');
        if (imageList) imageList.innerHTML = '';
        
        const bulkTiersContainer = document.getElementById('bulkTiersContainer');
        if (bulkTiersContainer) bulkTiersContainer.innerHTML = '';
        
        const imagesPreview = document.getElementById('imagesPreview');
        if (imagesPreview) {
            imagesPreview.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click to upload product images</p>
                <small>You can select multiple images (Max 5)</small>
            `;
        }
    },
    
    async saveProduct(status = 'active') {
        const title = document.getElementById('productTitle').value;
        const description = document.getElementById('productDescription').value;
        const categoryId = document.getElementById('productCategory').value;
        const price = parseFloat(document.getElementById('regularPrice').value);
        const stockQuantity = parseInt(document.getElementById('stockQuantity').value);
        
        if (!title || !description || !categoryId || !price || stockQuantity === undefined) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const productId = document.getElementById('productId').value;
        const subcategoryId = document.getElementById('productSubcategory').value || null;
        const wholesalePrice = parseFloat(document.getElementById('wholesalePrice').value) || null;
        const moq = parseInt(document.getElementById('moq').value) || 1;
        const maxOrderQty = parseInt(document.getElementById('maxOrderQty').value) || null;
        const leadTime = parseInt(document.getElementById('leadTime').value) || 3;
        const lowStockThreshold = parseInt(document.getElementById('lowStockThreshold').value) || 10;
        const tags = document.getElementById('productTags').value.split(',').map(t => t.trim()).filter(t => t);
        
        const productData = {
            supplier_id: this.supplier.id,
            seller_id: this.currentUser.id,
            title: title,
            description: description,
            category_id: parseInt(categoryId),
            subcategory_id: subcategoryId ? parseInt(subcategoryId) : null,
            price: price,
            wholesale_price: wholesalePrice,
            currency: 'UGX',
            stock_quantity: stockQuantity,
            low_stock_threshold: lowStockThreshold,
            moq: moq,
            max_order_quantity: maxOrderQty,
            lead_time_days: leadTime,
            sku: document.getElementById('productSku').value || null,
            brand: document.getElementById('productBrand').value || null,
            model: document.getElementById('productModel').value || null,
            condition: document.getElementById('productCondition').value,
            tags: tags,
            region: document.getElementById('region').value,
            district: document.getElementById('district').value,
            specific_location: document.getElementById('specificLocation').value || null,
            image_urls: this.imageUrls,
            is_bulk_only: document.getElementById('isBulkOnly').checked,
            is_negotiable: document.getElementById('isNegotiable').checked,
            status: status,
            updated_at: new Date().toISOString()
        };
        
        if (document.getElementById('isActive').checked) {
            productData.status = 'active';
        }
        
        try {
            let result;
            
            if (productId) {
                // Update
                result = await sb
                    .from('ads')
                    .update(productData)
                    .eq('id', productId);
            } else {
                // Create
                productData.created_at = new Date().toISOString();
                productData.view_count = 0;
                productData.click_count = 0;
                
                result = await sb
                    .from('ads')
                    .insert([productData]);
            }
            
            if (result.error) throw result.error;
            
            // Save bulk pricing tiers if any
            if (this.bulkTiers.length > 0) {
                const productId = result.data?.[0]?.id || productId;
                await this.saveBulkTiers(productId);
            }
            
            this.closeProductModal();
            this.showToast(`Product ${productId ? 'updated' : 'created'} successfully`, 'success');
            await this.loadProducts(true);
            
        } catch (error) {
            console.error('Error saving product:', error);
            this.showToast('Error saving product', 'error');
        }
    },
    
    saveAsDraft() {
        this.saveProduct('draft');
    },
    
    saveAndPublish() {
        this.saveProduct('active');
    },
    
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
                        ${images.map(url => `
                            <div class="view-product-image">
                                <img src="${url}" alt="${product.title}">
                            </div>
                        `).join('')}
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
                        ${product.tags.map(tag => `<span style="background: var(--gray-100); padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-right: 8px;">#${tag}</span>`).join('')}
                    </div>
                ` : ''}
            `;
        }
        
        const viewTitle = document.getElementById('viewProductTitle');
        if (viewTitle) viewTitle.textContent = product.title;
        
        const viewModal = document.getElementById('viewProductModal');
        if (viewModal) viewModal.classList.add('show');
    },
    
    editProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (product) {
            this.openProductModal(product);
        }
    },
    
    editFromView() {
        this.closeViewModal();
        if (this.currentProduct) {
            this.openProductModal(this.currentProduct);
        }
    },
    
    async duplicateProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        const { id, created_at, updated_at, view_count, click_count, ...productData } = product;
        
        productData.title = `${productData.title} (Copy)`;
        productData.status = 'draft';
        productData.sku = productData.sku ? `${productData.sku}-COPY` : null;
        
        try {
            const { error } = await sb
                .from('ads')
                .insert([productData]);
            
            if (error) throw error;
            
            this.showToast('Product duplicated successfully', 'success');
            await this.loadProducts(true);
            
        } catch (error) {
            console.error('Error duplicating product:', error);
            this.showToast('Error duplicating product', 'error');
        }
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
    // IMAGE UPLOAD
    // ============================================
    async uploadImages(files) {
        try {
            this.showToast('Compressing images...', 'info');
            
            for (const file of files) {
                const compressedFile = await this.compressImage(file, 800, 0.8);
                const fileName = `products/${this.supplier.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                
                const { error } = await sb.storage
                    .from('product-images')
                    .upload(fileName, compressedFile);
                
                if (error) throw error;
                
                const { data: { publicUrl } } = sb.storage
                    .from('product-images')
                    .getPublicUrl(fileName);
                
                this.imageUrls.push(publicUrl);
            }
            
            this.renderImageList();
            this.showToast(`${files.length} image(s) uploaded`, 'success');
            
        } catch (error) {
            console.error('Error uploading images:', error);
            this.showToast('Error uploading images', 'error');
        }
    },
    
    compressImage(file, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    }, 'image/jpeg', quality);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    },
    
    renderImageList() {
        const container = document.getElementById('imageList');
        if (!container) return;
        
        container.innerHTML = this.imageUrls.map((url, index) => `
            <div class="image-item">
                <img src="${url}" alt="Product image ${index + 1}">
                <button class="remove-image" onclick="SupplierProducts.removeImage(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
        
        const imageUrls = document.getElementById('imageUrls');
        if (imageUrls) imageUrls.value = JSON.stringify(this.imageUrls);
    },
    
    removeImage(index) {
        this.imageUrls.splice(index, 1);
        this.renderImageList();
    },
    
    // ============================================
    // BULK PRICING TIERS
    // ============================================
    addBulkTier() {
        this.bulkTiers.push({
            min_quantity: 10,
            max_quantity: null,
            price_per_unit: 0,
            discount_percentage: 0
        });
        this.renderBulkTiers();
    },
    
    removeBulkTier(button) {
        const index = button.closest('.bulk-tier-item')?.dataset.index;
        if (index !== undefined) {
            this.bulkTiers.splice(index, 1);
            this.renderBulkTiers();
        }
    },
    
    renderBulkTiers() {
        const container = document.getElementById('bulkTiersContainer');
        if (!container) return;
        
        container.innerHTML = this.bulkTiers.map((tier, index) => `
            <div class="bulk-tier-item" data-index="${index}">
                <div class="bulk-tier-fields">
                    <input type="number" class="tier-min-qty" value="${tier.min_quantity}" placeholder="Min Qty" min="1" onchange="SupplierProducts.updateBulkTier(${index}, 'min_quantity', this.value)">
                    <input type="number" class="tier-max-qty" value="${tier.max_quantity || ''}" placeholder="Max Qty" min="1" onchange="SupplierProducts.updateBulkTier(${index}, 'max_quantity', this.value)">
                    <input type="number" class="tier-price" value="${tier.price_per_unit}" placeholder="Price" min="0" step="100" onchange="SupplierProducts.updateBulkTier(${index}, 'price_per_unit', this.value)">
                    <input type="number" class="tier-discount" value="${tier.discount_percentage || 0}" placeholder="Discount %" min="0" max="100" step="0.1" onchange="SupplierProducts.updateBulkTier(${index}, 'discount_percentage', this.value)">
                </div>
                <button type="button" class="btn-icon btn-danger" onclick="SupplierProducts.removeBulkTier(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },
    
    updateBulkTier(index, field, value) {
        if (this.bulkTiers[index]) {
            this.bulkTiers[index][field] = value === '' ? null : parseFloat(value);
        }
    },
    
    async saveBulkTiers(productId) {
        const tiers = this.bulkTiers.map(tier => ({
            ad_id: productId,
            min_quantity: tier.min_quantity,
            max_quantity: tier.max_quantity || null,
            price_per_unit: tier.price_per_unit,
            discount_percentage: tier.discount_percentage || 0
        }));
        
        const { error } = await sb
            .from('bulk_pricing')
            .insert(tiers);
        
        if (error) throw error;
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
    
    closeSuccessModal() {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.remove('show');
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
        
        // Category change - load subcategories
        const categorySelect = document.getElementById('productCategory');
        if (categorySelect) {
            categorySelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.loadSubcategories(e.target.value);
                }
            });
        }
        
        // Image upload
        const uploadArea = document.getElementById('productImagesUpload');
        const fileInput = document.getElementById('productImages');
        
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 5) {
                    this.showToast('Maximum 5 images allowed', 'error');
                    return;
                }
                await this.uploadImages(files);
            });
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeProductModal();
                    this.closeViewModal();
                    this.closeDeleteModal();
                    this.closeSuccessModal();
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
                this.closeProductModal();
                this.closeViewModal();
                this.closeDeleteModal();
                this.closeSuccessModal();
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
window.openProductModal = () => SupplierProducts.openProductModal();
window.closeProductModal = () => SupplierProducts.closeProductModal();
window.closeViewModal = () => SupplierProducts.closeViewModal();
window.closeDeleteModal = () => SupplierProducts.closeDeleteModal();
window.saveAsDraft = () => SupplierProducts.saveAsDraft();
window.saveAndPublish = () => SupplierProducts.saveAndPublish();
window.addBulkTier = () => SupplierProducts.addBulkTier();
window.removeBulkTier = (btn) => SupplierProducts.removeBulkTier(btn);
window.updateBulkTier = (index, field, value) => SupplierProducts.updateBulkTier(index, field, value);
window.removeImage = (index) => SupplierProducts.removeImage(index);
window.applyFilters = () => SupplierProducts.applyFilters();
window.resetFilters = () => SupplierProducts.resetFilters();
window.loadMoreProducts = () => SupplierProducts.loadMoreProducts();
window.exportProducts = () => SupplierProducts.exportProducts();