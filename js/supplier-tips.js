// ============================================
// SUPPLIER TIPS MANAGEMENT - COMPLETE FIXED
// ============================================

console.log('🚀 Supplier Tips loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase client
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierTips = {
    currentUser: null,
    supplier: null,
    tips: [],
    filteredTips: [],
    currentTip: null,
    quill: null,
    quillInitialized: false,
    usingFallbackEditor: false,
    currentPage: 1,
    itemsPerPage: 12,
    hasMore: true,
    isLoading: false,
    currentFilter: 'all',
    searchTerm: '',
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Tips initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            
            // Initialize editor after a short delay
            setTimeout(() => {
                this.initEditor();
            }, 1000);
            
            await this.loadTips();
            this.setupEventListeners();
            
            console.log('✅ Supplier Tips initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading tips', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-tips.html';
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
        }
    },
    
    async loadTips(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            const loadingEl = document.getElementById('loadingState');
            if (loadingEl) loadingEl.style.display = 'block';
            
            const tipsGrid = document.getElementById('tipsGrid');
            if (tipsGrid) tipsGrid.innerHTML = '';
            
            const emptyEl = document.getElementById('emptyState');
            if (emptyEl) emptyEl.style.display = 'none';
            
            const loadMoreEl = document.getElementById('loadMore');
            if (loadMoreEl) loadMoreEl.style.display = 'none';
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            let query = sb
                .from('supplier_tips')
                .select('*')
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
            
            // Apply filter
            if (this.currentFilter === 'published') {
                query = query.eq('is_published', true);
            } else if (this.currentFilter === 'draft') {
                query = query.eq('is_published', false);
            }
            
            // Apply search
            if (this.searchTerm) {
                query = query.or(`title.ilike.%${this.searchTerm}%,excerpt.ilike.%${this.searchTerm}%`);
            }
            
            const { data, error } = await query.range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.tips = data || [];
            } else {
                this.tips = [...this.tips, ...(data || [])];
            }
            
            this.filteredTips = [...this.tips];
            this.hasMore = (data || []).length === this.itemsPerPage;
            
            this.updateStats();
            this.renderTips();
            
            const loadingEl = document.getElementById('loadingState');
            if (loadingEl) loadingEl.style.display = 'none';
            
            const emptyEl = document.getElementById('emptyState');
            if (emptyEl) {
                emptyEl.style.display = this.filteredTips.length === 0 ? 'block' : 'none';
            }
            
            const loadMoreEl = document.getElementById('loadMore');
            if (loadMoreEl) {
                loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
            }
            
        } catch (error) {
            console.error('Error loading tips:', error);
            this.showToast('Error loading tips', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // UPDATE STATS
    // ============================================
    updateStats() {
        const total = this.tips.length;
        const published = this.tips.filter(t => t.is_published).length;
        const drafts = this.tips.filter(t => !t.is_published).length;
        const totalViews = this.tips.reduce((sum, t) => sum + (t.view_count || 0), 0);
        
        const totalEl = document.getElementById('totalTips');
        const publishedEl = document.getElementById('publishedTips');
        const draftsEl = document.getElementById('draftTips');
        const viewsEl = document.getElementById('totalViews');
        
        if (totalEl) totalEl.textContent = total;
        if (publishedEl) publishedEl.textContent = published;
        if (draftsEl) draftsEl.textContent = drafts;
        if (viewsEl) viewsEl.textContent = this.formatNumber(totalViews);
    },
    
    // ============================================
    // RENDER TIPS
    // ============================================
    renderTips() {
        const container = document.getElementById('tipsGrid');
        if (!container) return;
        
        if (this.filteredTips.length === 0) return;
        
        container.innerHTML = this.filteredTips.map(tip => this.renderTipCard(tip)).join('');
    },
    
    renderTipCard(tip) {
        const imageUrl = tip.featured_image || 'https://via.placeholder.com/300x200?text=No+Image';
        const date = tip.published_at || tip.created_at;
        const formattedDate = date ? new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'Draft';
        
        const status = tip.is_published ? 'published' : 'draft';
        const excerpt = tip.excerpt || (tip.content ? tip.content.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : 'No content yet');
        
        return `
            <div class="tip-card ${status}" data-tip-id="${tip.id}" onclick="SupplierTips.viewTip(${tip.id})">
                <div class="tip-image">
                    <img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(tip.title)}" loading="lazy">
                    ${tip.featured ? '<span class="tip-badge featured"><i class="fas fa-star"></i> Featured</span>' : ''}
                    ${!tip.is_published ? '<span class="tip-badge draft">Draft</span>' : ''}
                </div>
                <div class="tip-content">
                    <span class="tip-category">${tip.category || 'General'}</span>
                    <h3 class="tip-title">${this.escapeHtml(tip.title)}</h3>
                    <p class="tip-excerpt">${this.escapeHtml(excerpt)}</p>
                    <div class="tip-footer">
                        <div class="tip-stats">
                            <span><i class="far fa-eye"></i> ${tip.view_count || 0}</span>
                            <span><i class="far fa-clock"></i> ${formattedDate}</span>
                        </div>
                        <div class="tip-actions" onclick="event.stopPropagation()">
                            <button class="btn-icon" onclick="SupplierTips.editTip(${tip.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="SupplierTips.duplicateTip(${tip.id})" title="Duplicate">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="btn-icon" onclick="SupplierTips.togglePublish(${tip.id})" title="${tip.is_published ? 'Unpublish' : 'Publish'}">
                                <i class="fas ${tip.is_published ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="SupplierTips.deleteTip(${tip.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // EDITOR INITIALIZATION - FIXED
    // ============================================
    initEditor() {
        const editorContainer = document.getElementById('editor-container');
        if (!editorContainer) {
            console.error('Editor container not found');
            return;
        }
        
        // Clear container
        editorContainer.innerHTML = '';
        
        // Check if Quill is available
        if (typeof Quill !== 'undefined') {
            try {
                this.initQuill(editorContainer);
            } catch (error) {
                console.error('Error initializing Quill:', error);
                this.initFallbackEditor(editorContainer);
            }
        } else {
            console.log('Quill not available, using fallback editor');
            this.initFallbackEditor(editorContainer);
        }
    },
    
    initQuill(container) {
        try {
            // Create toolbar and editor
            const toolbar = document.createElement('div');
            toolbar.id = 'quill-toolbar';
            toolbar.innerHTML = `
                <span class="ql-formats">
                    <select class="ql-header">
                        <option value="1">Heading 1</option>
                        <option value="2">Heading 2</option>
                        <option value="3">Heading 3</option>
                        <option value="4">Heading 4</option>
                        <option value="5">Heading 5</option>
                        <option value="6">Heading 6</option>
                        <option value="">Normal</option>
                    </select>
                </span>
                <span class="ql-formats">
                    <button class="ql-bold"></button>
                    <button class="ql-italic"></button>
                    <button class="ql-underline"></button>
                    <button class="ql-strike"></button>
                </span>
                <span class="ql-formats">
                    <button class="ql-list" value="ordered"></button>
                    <button class="ql-list" value="bullet"></button>
                </span>
                <span class="ql-formats">
                    <button class="ql-link"></button>
                    <button class="ql-image"></button>
                </span>
                <span class="ql-formats">
                    <button class="ql-clean"></button>
                </span>
            `;
            
            const editor = document.createElement('div');
            editor.id = 'quill-editor';
            editor.style.height = '300px';
            
            container.appendChild(toolbar);
            container.appendChild(editor);
            
            // Initialize Quill
            this.quill = new Quill('#quill-editor', {
                theme: 'snow',
                placeholder: 'Write your tip content here...',
                modules: {
                    toolbar: '#quill-toolbar'
                }
            });
            
            this.quillInitialized = true;
            this.usingFallbackEditor = false;
            console.log('✅ Quill editor initialized successfully');
            
            // Update preview on text change
            this.quill.on('text-change', () => {
                this.updatePreview();
            });
            
            // Load content if editing
            if (this.currentTip && this.currentTip.content) {
                this.quill.root.innerHTML = this.currentTip.content;
            }
            
        } catch (error) {
            console.error('Error in Quill initialization:', error);
            this.initFallbackEditor(container);
        }
    },
    
    initFallbackEditor(container) {
        this.usingFallbackEditor = true;
        this.quillInitialized = false;
        
        container.innerHTML = `
            <textarea id="fallbackEditor" class="fallback-editor" rows="12" 
                placeholder="Write your tip content here... (HTML is supported)"></textarea>
            <small style="color: var(--gray-500); margin-top: 8px; display: block;">
                <i class="fas fa-info-circle"></i> Using basic editor. Rich text editor not available.
            </small>
        `;
        
        console.log('✅ Fallback editor initialized');
        
        // Load content if editing
        if (this.currentTip && this.currentTip.content) {
            const fallbackEditor = document.getElementById('fallbackEditor');
            if (fallbackEditor) {
                // Strip HTML for plain text editing
                fallbackEditor.value = this.currentTip.content.replace(/<[^>]*>/g, '');
            }
        }
        
        // Add input event for preview
        const fallbackEditor = document.getElementById('fallbackEditor');
        if (fallbackEditor) {
            fallbackEditor.addEventListener('input', () => this.updatePreview());
        }
    },
    
    // ============================================
    // UPDATE PREVIEW
    // ============================================
    updatePreview() {
        const title = document.getElementById('tipTitle');
        const excerpt = document.getElementById('tipExcerpt');
        const category = document.getElementById('tipCategory');
        const readTime = document.getElementById('readTime');
        
        const previewTitle = document.getElementById('previewTitle');
        const previewCategory = document.getElementById('previewCategory');
        const previewExcerpt = document.getElementById('previewExcerpt');
        const previewReadTime = document.getElementById('previewReadTime');
        
        if (previewTitle) {
            previewTitle.textContent = title ? (title.value || 'Tip Title') : 'Tip Title';
        }
        
        if (previewCategory) {
            previewCategory.textContent = category ? this.formatCategory(category.value) : 'General';
        }
        
        if (previewExcerpt) {
            previewExcerpt.textContent = excerpt ? (excerpt.value || 'Your excerpt will appear here...') : 'Your excerpt will appear here...';
        }
        
        if (previewReadTime) {
            previewReadTime.textContent = readTime ? (readTime.value || '3') : '3';
        }
    },
    
    // ============================================
    // TIP CRUD OPERATIONS
    // ============================================
    openTipModal(tip = null) {
        this.resetForm();
        
        if (tip) {
            // Edit mode
            this.currentTip = tip;
            document.getElementById('modalTitle').textContent = 'Edit Tip';
            document.getElementById('tipId').value = tip.id;
            document.getElementById('tipTitle').value = tip.title || '';
            document.getElementById('tipCategory').value = tip.category || 'general';
            document.getElementById('readTime').value = tip.read_time || 3;
            document.getElementById('tipExcerpt').value = tip.excerpt || '';
            document.getElementById('tipTags').value = (tip.tags || []).join(', ');
            document.getElementById('metaTitle').value = tip.meta_title || '';
            document.getElementById('metaDescription').value = tip.meta_description || '';
            document.getElementById('tipStatus').value = tip.is_published ? 'published' : 'draft';
            document.getElementById('featuredTip').checked = tip.featured || false;
            
            if (tip.scheduled_date) {
                document.getElementById('scheduledDate').value = tip.scheduled_date.slice(0, 16);
            }
            
            if (tip.featured_image) {
                document.getElementById('featuredImagePreview').innerHTML = `
                    <img src="${tip.featured_image}" style="max-width: 100%; max-height: 150px;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="SupplierTips.removeFeaturedImage()">Remove</button>
                `;
                document.getElementById('featuredImageUrl').value = tip.featured_image;
            }
            
            // Set content in editor
            setTimeout(() => {
                if (this.quill && this.quillInitialized && tip.content) {
                    this.quill.root.innerHTML = tip.content;
                } else if (this.usingFallbackEditor) {
                    const fallbackEditor = document.getElementById('fallbackEditor');
                    if (fallbackEditor && tip.content) {
                        fallbackEditor.value = tip.content.replace(/<[^>]*>/g, '');
                    }
                }
            }, 200);
            
        } else {
            // Create mode
            this.currentTip = null;
            document.getElementById('modalTitle').textContent = 'Create New Tip';
            
            // Set default scheduled date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const scheduledEl = document.getElementById('scheduledDate');
            if (scheduledEl) {
                scheduledEl.value = tomorrow.toISOString().slice(0, 16);
            }
        }
        
        this.updatePreview();
        document.getElementById('tipModal').classList.add('show');
    },
    
    closeTipModal() {
        document.getElementById('tipModal').classList.remove('show');
        this.resetForm();
    },
    
    resetForm() {
        const form = document.getElementById('tipForm');
        if (form) form.reset();
        
        const tipId = document.getElementById('tipId');
        if (tipId) tipId.value = '';
        
        const featuredImageUrl = document.getElementById('featuredImageUrl');
        if (featuredImageUrl) featuredImageUrl.value = '';
        
        const featuredPreview = document.getElementById('featuredImagePreview');
        if (featuredPreview) {
            featuredPreview.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click to upload featured image</p>
                <small>Recommended: 1200x630px (will be compressed)</small>
            `;
        }
        
        // Clear Quill content
        if (this.quill && this.quillInitialized) {
            this.quill.root.innerHTML = '';
        }
        
        // Clear fallback editor
        const fallbackEditor = document.getElementById('fallbackEditor');
        if (fallbackEditor) {
            fallbackEditor.value = '';
        }
        
        this.updatePreview();
    },
    
    async saveTip(status = 'draft') {
        const title = document.getElementById('tipTitle')?.value;
        
        if (!title) {
            this.showToast('Please enter a title', 'error');
            return;
        }
        
        // Get content from editor
        let content = '';
        
        if (this.quill && this.quillInitialized) {
            content = this.quill.root.innerHTML;
        } else {
            const fallbackEditor = document.getElementById('fallbackEditor');
            if (fallbackEditor) {
                // Convert plain text to paragraphs
                const text = fallbackEditor.value;
                content = text.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
            }
        }
        
        if (!content) {
            this.showToast('Please enter some content', 'error');
            return;
        }
        
        const tipId = document.getElementById('tipId')?.value;
        const category = document.getElementById('tipCategory')?.value || 'general';
        const readTime = parseInt(document.getElementById('readTime')?.value) || 3;
        const excerpt = document.getElementById('tipExcerpt')?.value || content.replace(/<[^>]*>/g, '').substring(0, 150) + '...';
        const tagsInput = document.getElementById('tipTags')?.value;
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        const featuredImage = document.getElementById('featuredImageUrl')?.value || null;
        const metaTitle = document.getElementById('metaTitle')?.value || title;
        const metaDescription = document.getElementById('metaDescription')?.value || excerpt;
        const isPublished = status === 'published';
        const scheduledDate = document.getElementById('scheduledDate')?.value || null;
        const featured = document.getElementById('featuredTip')?.checked || false;
        
        const tipData = {
            supplier_id: this.supplier.id,
            title: title,
            content: content,
            excerpt: excerpt,
            category: category,
            read_time: readTime,
            tags: tags,
            featured_image: featuredImage,
            meta_title: metaTitle,
            meta_description: metaDescription,
            is_published: isPublished,
            featured: featured,
            updated_at: new Date().toISOString()
        };
        
        if (scheduledDate && isPublished) {
            tipData.published_at = new Date(scheduledDate).toISOString();
        } else if (isPublished) {
            tipData.published_at = new Date().toISOString();
        }
        
        try {
            let result;
            
            if (tipId) {
                // Update
                result = await sb
                    .from('supplier_tips')
                    .update(tipData)
                    .eq('id', tipId);
            } else {
                // Create
                tipData.created_at = new Date().toISOString();
                tipData.view_count = 0;
                
                result = await sb
                    .from('supplier_tips')
                    .insert([tipData]);
            }
            
            if (result.error) throw result.error;
            
            this.closeTipModal();
            this.showToast(`Tip ${tipId ? 'updated' : 'created'} successfully`, 'success');
            await this.loadTips(true);
            
        } catch (error) {
            console.error('Error saving tip:', error);
            this.showToast('Error saving tip', 'error');
        }
    },
    
    saveTipAsDraft() {
        this.saveTip('draft');
    },
    
    publishTip() {
        this.saveTip('published');
    },
    
    async viewTip(tipId) {
        const tip = this.tips.find(t => t.id === tipId);
        if (!tip) return;
        
        this.currentTip = tip;
        
        const modalBody = document.getElementById('viewTipBody');
        const date = tip.published_at || tip.created_at;
        const formattedDate = date ? new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'N/A';
        
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="view-tip-meta">
                    <span><i class="far fa-calendar"></i> ${formattedDate}</span>
                    <span><i class="far fa-clock"></i> ${tip.read_time || 3} min read</span>
                    <span><i class="far fa-eye"></i> ${tip.view_count || 0} views</span>
                    <span><i class="fas fa-tag"></i> ${tip.category || 'General'}</span>
                </div>
                
                ${tip.featured_image ? `
                    <img src="${tip.featured_image}" alt="${tip.title}" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: var(--radius); margin-bottom: 20px;">
                ` : ''}
                
                <h2 style="margin-bottom: 16px;">${this.escapeHtml(tip.title)}</h2>
                
                <div class="view-tip-content">
                    ${tip.content || ''}
                </div>
                
                ${tip.tags && tip.tags.length > 0 ? `
                    <div class="view-tip-tags">
                        ${tip.tags.map(tag => `<span class="view-tip-tag">#${tag}</span>`).join('')}
                    </div>
                ` : ''}
            `;
        }
        
        const viewTitle = document.getElementById('viewTipTitle');
        if (viewTitle) viewTitle.textContent = tip.title;
        
        document.getElementById('viewTipModal').classList.add('show');
    },
    
    editTip(tipId) {
        const tip = this.tips.find(t => t.id === tipId);
        if (tip) {
            this.openTipModal(tip);
        }
    },
    
    editFromView() {
        this.closeViewTipModal();
        if (this.currentTip) {
            this.openTipModal(this.currentTip);
        }
    },
    
    async duplicateTip(tipId) {
        const tip = this.tips.find(t => t.id === tipId);
        if (!tip) return;
        
        const { id, created_at, updated_at, view_count, ...tipData } = tip;
        
        tipData.title = `${tipData.title} (Copy)`;
        tipData.is_published = false;
        tipData.featured = false;
        
        try {
            const { error } = await sb
                .from('supplier_tips')
                .insert([tipData]);
            
            if (error) throw error;
            
            this.showToast('Tip duplicated successfully', 'success');
            await this.loadTips(true);
            
        } catch (error) {
            console.error('Error duplicating tip:', error);
            this.showToast('Error duplicating tip', 'error');
        }
    },
    
    async togglePublish(tipId) {
        const tip = this.tips.find(t => t.id === tipId);
        if (!tip) return;
        
        const newStatus = !tip.is_published;
        const action = newStatus ? 'publish' : 'unpublish';
        
        if (!confirm(`Are you sure you want to ${action} this tip?`)) return;
        
        try {
            const updates = {
                is_published: newStatus,
                updated_at: new Date().toISOString()
            };
            
            if (newStatus && !tip.published_at) {
                updates.published_at = new Date().toISOString();
            }
            
            const { error } = await sb
                .from('supplier_tips')
                .update(updates)
                .eq('id', tipId);
            
            if (error) throw error;
            
            this.showToast(`Tip ${newStatus ? 'published' : 'unpublished'} successfully`, 'success');
            await this.loadTips(true);
            
        } catch (error) {
            console.error('Error toggling publish status:', error);
            this.showToast('Error updating tip', 'error');
        }
    },
    
    deleteTip(tipId) {
        const tip = this.tips.find(t => t.id === tipId);
        if (!tip) return;
        
        this.currentTip = tip;
        const deleteName = document.getElementById('deleteTipName');
        if (deleteName) deleteName.textContent = tip.title;
        
        document.getElementById('deleteModal').classList.add('show');
    },
    
    async confirmDelete() {
        if (!this.currentTip) return;
        
        try {
            const { error } = await sb
                .from('supplier_tips')
                .delete()
                .eq('id', this.currentTip.id);
            
            if (error) throw error;
            
            this.closeDeleteModal();
            this.showToast('Tip deleted successfully', 'success');
            await this.loadTips(true);
            
        } catch (error) {
            console.error('Error deleting tip:', error);
            this.showToast('Error deleting tip', 'error');
        }
    },
    
    // ============================================
    // IMAGE UPLOAD
    // ============================================
    async uploadFeaturedImage(file) {
        try {
            this.showToast('Compressing image...', 'info');
            
            // Compress image
            const compressedFile = await this.compressImage(file, 1200, 0.8);
            
            const fileName = `tips/${this.supplier.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            
            const { error } = await sb.storage
                .from('supplier-assets')
                .upload(fileName, compressedFile);
            
            if (error) throw error;
            
            const { data: { publicUrl } } = sb.storage
                .from('supplier-assets')
                .getPublicUrl(fileName);
            
            return publicUrl;
            
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
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
    
    removeFeaturedImage() {
        const urlInput = document.getElementById('featuredImageUrl');
        if (urlInput) urlInput.value = '';
        
        const preview = document.getElementById('featuredImagePreview');
        if (preview) {
            preview.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click to upload featured image</p>
                <small>Recommended: 1200x630px (will be compressed)</small>
            `;
        }
    },
    
    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    filterTips(filter) {
        this.currentFilter = filter;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.loadTips(true);
    },
    
    handleSearch() {
        const searchInput = document.getElementById('searchInput');
        this.searchTerm = searchInput ? searchInput.value : '';
        this.loadTips(true);
    },
    
    loadMoreTips() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadTips(false);
    },
    
    refreshTips() {
        this.loadTips(true);
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeViewTipModal() {
        document.getElementById('viewTipModal').classList.remove('show');
    },
    
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        this.currentTip = null;
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    formatCategory(category) {
        const categories = {
            'general': 'General',
            'buying': 'Buying Tips',
            'selling': 'Selling Tips',
            'product': 'Product Care',
            'industry': 'Industry News',
            'trends': 'Market Trends'
        };
        return categories[category] || category;
    },
    
    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
                this.filterTips(filter);
            });
        });
        
        // Form preview updates
        const tipTitle = document.getElementById('tipTitle');
        if (tipTitle) tipTitle.addEventListener('input', () => this.updatePreview());
        
        const tipExcerpt = document.getElementById('tipExcerpt');
        if (tipExcerpt) {
            tipExcerpt.addEventListener('input', (e) => {
                this.updatePreview();
                const countEl = document.getElementById('excerptCount');
                if (countEl) countEl.textContent = e.target.value.length;
            });
        }
        
        const tipCategory = document.getElementById('tipCategory');
        if (tipCategory) tipCategory.addEventListener('change', () => this.updatePreview());
        
        const readTime = document.getElementById('readTime');
        if (readTime) readTime.addEventListener('input', () => this.updatePreview());
        
        // Image upload
        const uploadArea = document.getElementById('featuredImageUpload');
        const fileInput = document.getElementById('featuredImage');
        
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const url = await this.uploadFeaturedImage(file);
                        const urlInput = document.getElementById('featuredImageUrl');
                        if (urlInput) urlInput.value = url;
                        
                        const preview = document.getElementById('featuredImagePreview');
                        if (preview) {
                            preview.innerHTML = `
                                <img src="${url}" style="max-width: 100%; max-height: 150px;">
                                <button type="button" class="btn btn-sm btn-danger" onclick="SupplierTips.removeFeaturedImage()">Remove</button>
                            `;
                        }
                        this.showToast('Image uploaded successfully', 'success');
                    } catch (error) {
                        this.showToast('Error uploading image', 'error');
                    }
                }
            });
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeTipModal();
                    this.closeViewTipModal();
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
                this.closeTipModal();
                this.closeViewTipModal();
                this.closeDeleteModal();
                this.closeSuccessModal();
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
// Wait for DOM and scripts to load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        SupplierTips.init();
    });
} else {
    SupplierTips.init();
}

// Global functions
window.SupplierTips = SupplierTips;