// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Management
let categories = [];
let currentDeleteId = null;
let currentDeleteName = '';

// Common icons for categories
const commonIcons = [
    'mobile-alt', 'car', 'home', 'tv', 'tshirt', 'briefcase', 'couch', 'tractor',
    'store', 'motorcycle', 'bicycle', 'building', 'tree', 'tablet', 'phone',
    'headphones', 'truck', 'cog', 'tag', 'utensils', 'fan', 'blender', 'mug-hot',
    'tooth', 'ice-cream', 'lightbulb', 'chair', 'bed', 'sofa', 'laptop', 'camera',
    'watch', 'shoe-prints', 'baby', 'book', 'gamepad', 'gift', 'tools', 'paint-brush'
];

// Compression profiles for different image types
const compressionProfiles = {
    category: {
        maxSizeMB: 0.5,        // 500KB for category images
        maxWidthOrHeight: 800,  // Max dimension
        useWebWorker: true,
        fileType: 'image/webp',  // Convert to WebP for better compression
        initialQuality: 0.85,    // Initial quality (0-1)
        alwaysKeepResolution: false,
        maxIteration: 10
    },
    banner: {
        maxSizeMB: 1,           // 1MB for banners
        maxWidthOrHeight: 1920,  // Max dimension for banners
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.9,
        alwaysKeepResolution: false,
        maxIteration: 10
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminAuth();
    await loadCategories();
    initIconSelector();
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('searchCategories')?.addEventListener('input', handleSearch);
}

// Authentication
async function checkAdminAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'admin-login.html?redirect=admin-categories.html';
            return;
        }

        const { data: profile } = await sb
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (!profile?.is_admin) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showToast('Authentication error');
    }
}

// Load Categories
async function loadCategories() {
    const container = document.getElementById('categoryTreeContainer');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner spinner"></i> Loading categories...</div>';

    try {
        const { data, error } = await sb
            .from('categories')
            .select(`
                *,
                parent:parent_id (
                    id,
                    name
                )
            `)
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;

        categories = data || [];
        
        // Get ad counts for each category
        const { data: ads } = await sb
            .from('ads')
            .select('category_id, subcategory_id')
            .eq('status', 'active');

        const adCounts = {};
        ads?.forEach(ad => {
            if (ad.category_id) adCounts[ad.category_id] = (adCounts[ad.category_id] || 0) + 1;
            if (ad.subcategory_id) adCounts[ad.subcategory_id] = (adCounts[ad.subcategory_id] || 0) + 1;
        });

        // Build category tree
        const rootCategories = categories.filter(c => !c.parent_id);
        const treeHtml = buildCategoryTree(rootCategories, adCounts);
        container.innerHTML = treeHtml;

        // Populate parent category dropdown
        populateParentDropdown();

    } catch (error) {
        console.error('Error loading categories:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">Error loading categories</div>';
    }
}

// Build Category Tree
function buildCategoryTree(categoriesList, adCounts, level = 0) {
    if (!categoriesList.length) return '';

    let html = '';
    categoriesList.forEach(cat => {
        const children = categories.filter(c => c.parent_id === cat.id);
        const adCount = adCounts[cat.id] || 0;
        
        html += `
            <div class="category-node ${level === 0 ? 'root' : ''}" data-id="${cat.id}">
                <div class="category-item">
                    <div class="category-info">
                        <span class="category-drag-handle"><i class="fas fa-grip-vertical"></i></span>
                        <div class="category-icon">
                            <i class="fas fa-${cat.icon || 'tag'}"></i>
                        </div>
                        <div class="category-details">
                            <div class="category-name">
                                ${escapeHtml(cat.name)}
                                ${!cat.is_active ? '<span class="badge badge-danger">Inactive</span>' : ''}
                                ${cat.featured ? '<span class="badge badge-success">Featured</span>' : ''}
                                ${children.length > 0 ? `<span class="badge badge-info">${children.length} sub</span>` : ''}
                            </div>
                            <div class="category-slug">${escapeHtml(cat.slug)}</div>
                            <div class="category-stats">
                                <span><i class="fas fa-box"></i> ${adCount} products</span>
                                ${cat.display_in_menu ? '<span><i class="fas fa-eye"></i> In Menu</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="category-actions">
                        <button class="btn btn-sm btn-icon" onclick="addSubcategory(${cat.id})" title="Add Subcategory">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-icon" onclick="editCategory(${cat.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-icon btn-danger" onclick="deleteCategory(${cat.id}, '${escapeHtml(cat.name)}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
        `;

        if (children.length > 0) {
            html += `<div class="children-container">${buildCategoryTree(children, adCounts, level + 1)}</div>`;
        }

        html += `</div>`;
    });

    return html;
}

// Populate Parent Dropdown (Fixed Version)
function populateParentDropdown() {
    const select = document.getElementById('parentCategory');
    if (!select) return;
    
    // Clear existing options
    select.innerHTML = '<option value="">None (Root Category)</option>';
    
    // Get the current category ID being edited (if any)
    const currentCategoryId = document.getElementById('categoryId')?.value;
    
    // Build a hierarchical list of categories for the dropdown
    const buildDropdownOptions = (categoriesList, level = 0) => {
        categoriesList.forEach(cat => {
            // Skip the current category and its children to prevent circular references
            if (currentCategoryId && (cat.id == currentCategoryId || isChildOf(cat.id, currentCategoryId))) {
                return;
            }
            
            const option = document.createElement('option');
            option.value = cat.id;
            
            // Add indentation based on level
            const indent = '— '.repeat(level);
            option.textContent = `${indent}${cat.name}`;
            
            select.appendChild(option);
            
            // Add children
            const children = categories.filter(c => c.parent_id === cat.id);
            if (children.length > 0) {
                buildDropdownOptions(children, level + 1);
            }
        });
    };
    
    // Helper function to check if a category is a child of another
    function isChildOf(childId, parentId) {
        const child = categories.find(c => c.id == childId);
        if (!child || !child.parent_id) return false;
        if (child.parent_id == parentId) return true;
        return isChildOf(child.parent_id, parentId);
    }
    
    // Start with root categories
    const rootCategories = categories.filter(c => !c.parent_id);
    buildDropdownOptions(rootCategories);
}

// Icon Selector
function initIconSelector() {
    const container = document.getElementById('iconSelector');
    if (!container) return;
    
    container.innerHTML = commonIcons.map(icon => 
        `<div class="icon-option" onclick="selectIcon('${icon}')" title="${icon}">
            <i class="fas fa-${icon}"></i>
        </div>`
    ).join('');
}

function selectIcon(icon) {
    document.getElementById('icon').value = icon;
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

// Slug Generation
function generateSlug() {
    const name = document.getElementById('name').value;
    const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    document.getElementById('slug').value = slug;
}

function updateParentId() {
    const select = document.getElementById('parentCategory');
    document.getElementById('parentId').value = select.value;
}

// Image Upload Functions with Compression
function triggerFileUpload(type) {
    document.getElementById(type === 'image' ? 'imageUpload' : 'bannerUpload').click();
}

async function handleImageUpload(input, type) {
    const file = input.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
        showToast('Image size should be less than 10MB', 'error');
        return;
    }

    try {
        showToast('Processing image...', 'info');

        // Select compression profile based on image type
        const profile = type === 'banner' ? compressionProfiles.banner : compressionProfiles.category;

        // Create a preview while compressing
        const previewUrl = URL.createObjectURL(file);
        const previewElement = type === 'image' ? 'imagePreview' : 'bannerPreview';
        document.getElementById(previewElement).innerHTML = 
            `<img src="${previewUrl}" class="image-preview" alt="Preview (compressing...)">`;

        // Compress the image
        showToast('Compressing image...', 'info');
        const compressedFile = await imageCompression(file, profile);

        // Calculate compression stats
        const originalSizeKB = (file.size / 1024).toFixed(0);
        const compressedSizeKB = (compressedFile.size / 1024).toFixed(0);
        const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(0);

        console.log(`📸 Compression stats for ${type}:`, {
            original: `${originalSizeKB}KB`,
            compressed: `${compressedSizeKB}KB`,
            saved: `${compressionRatio}%`,
            format: compressedFile.type
        });

        // Generate filename with compression info
        const fileExt = compressedFile.type.split('/')[1] || 'webp';
        const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${Date.now()}_${compressionRatio}pct_${safeFileName}`;
        const filePath = `categories/${type}/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await sb.storage
            .from('category-images')
            .upload(filePath, compressedFile, {
                cacheControl: '3600',
                upsert: false,
                contentType: compressedFile.type
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = sb.storage
            .from('category-images')
            .getPublicUrl(filePath);

        // Update form fields and final preview
        if (type === 'image') {
            document.getElementById('imageUrl').value = publicUrl;
            document.getElementById('imagePreview').innerHTML = `
                <img src="${publicUrl}" class="image-preview" alt="Preview">
                <small style="display: block; margin-top: 5px; color: var(--gray-600);">
                    📦 ${originalSizeKB}KB → ${compressedSizeKB}KB (${compressionRatio}% smaller)
                </small>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeImage('image')" style="margin-top: 5px;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            `;
        } else {
            document.getElementById('bannerUrl').value = publicUrl;
            document.getElementById('bannerPreview').innerHTML = `
                <img src="${publicUrl}" class="image-preview" alt="Preview">
                <small style="display: block; margin-top: 5px; color: var(--gray-600);">
                    📦 ${originalSizeKB}KB → ${compressedSizeKB}KB (${compressionRatio}% smaller)
                </small>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeImage('banner')" style="margin-top: 5px;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            `;
        }

        // Clean up preview URL
        URL.revokeObjectURL(previewUrl);

        showToast(`Image uploaded (${compressedSizeKB}KB, ${compressionRatio}% smaller)`, 'success');
    } catch (error) {
        console.error('Error uploading image:', error);
        showToast('Error uploading image. Please try again.', 'error');
    }
}

// Remove image function
function removeImage(type) {
    if (type === 'image') {
        document.getElementById('imageUrl').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('imageUpload').value = '';
    } else {
        document.getElementById('bannerUrl').value = '';
        document.getElementById('bannerPreview').innerHTML = '';
        document.getElementById('bannerUpload').value = '';
    }
    showToast('Image removed', 'info');
}

// Attribute Management
function addAttribute() {
    const container = document.getElementById('attributesContainer');
    const id = Date.now();
    
    const html = `
        <div class="attribute-item" id="attr_${id}">
            <input type="text" placeholder="Attribute Name" class="attr-name" style="flex: 2;">
            <select class="attr-type" style="flex: 1;">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Yes/No</option>
                <option value="select">Select</option>
                <option value="multiselect">Multi Select</option>
            </select>
            <input type="text" placeholder="Options (comma separated for select)" class="attr-options" style="flex: 2;">
            <button type="button" class="btn btn-sm btn-danger" onclick="removeAttribute(${id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', html);
}

function removeAttribute(id) {
    const element = document.getElementById(`attr_${id}`);
    if (element) {
        element.remove();
    }
}

// Category CRUD Operations
function addSubcategory(parentId) {
    openCategoryModal();
    document.getElementById('parentId').value = parentId;
    document.getElementById('parentCategory').value = parentId;
}

function openCategoryModal(id = null) {
    document.getElementById('categoryModal').classList.add('show');
    document.getElementById('modalTitle').textContent = id ? 'Edit Category' : 'Add Category';
    
    if (id) {
        loadCategoryForEdit(id);
    } else {
        resetCategoryForm();
    }
}

async function loadCategoryForEdit(id) {
    try {
        const { data: category, error } = await sb
            .from('categories')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Populate form fields
        document.getElementById('categoryId').value = category.id;
        document.getElementById('name').value = category.name || '';
        document.getElementById('slug').value = category.slug || '';
        document.getElementById('description').value = category.description || '';
        document.getElementById('parentId').value = category.parent_id || '';
        
        // First repopulate the parent dropdown with the current category ID excluded
        populateParentDropdown();
        
        // Then set the selected value
        document.getElementById('parentCategory').value = category.parent_id || '';
        
        document.getElementById('displayOrder').value = category.display_order || 0;
        document.getElementById('icon').value = category.icon || '';
        document.getElementById('displayName').value = category.display_name || '';
        document.getElementById('colorHex').value = category.color_hex || '#0B4F6C';
        document.getElementById('isActive').checked = category.is_active !== false;
        document.getElementById('displayInMenu').checked = category.display_in_menu !== false;
        document.getElementById('featured').checked = category.featured || false;
        document.getElementById('imageUrl').value = category.image_url || '';
        document.getElementById('bannerUrl').value = category.banner_url || '';
        document.getElementById('metaTitle').value = category.meta_title || '';
        document.getElementById('metaDescription').value = category.meta_description || '';
        document.getElementById('seoKeywords').value = category.seo_keywords ? category.seo_keywords.join(', ') : '';

        // Show image previews with remove buttons
        if (category.image_url) {
            document.getElementById('imagePreview').innerHTML = `
                <img src="${category.image_url}" class="image-preview">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeImage('image')" style="margin-top: 5px;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            `;
        }
        if (category.banner_url) {
            document.getElementById('bannerPreview').innerHTML = `
                <img src="${category.banner_url}" class="image-preview">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeImage('banner')" style="margin-top: 5px;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            `;
        }

        // Load attributes
        await loadCategoryAttributes(id);

        // Highlight selected icon
        if (category.icon) {
            document.querySelectorAll('.icon-option').forEach(opt => {
                if (opt.querySelector(`.fa-${category.icon}`)) {
                    opt.classList.add('selected');
                }
            });
        }

    } catch (error) {
        console.error('Error loading category:', error);
        showToast('Error loading category', 'error');
    }
}

async function loadCategoryAttributes(categoryId) {
    try {
        const { data: attributes, error } = await sb
            .from('category_attributes')
            .select('*')
            .eq('category_id', categoryId)
            .order('display_order');

        if (error) {
            if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
                console.log('Category attributes table not yet created');
                return;
            }
            throw error;
        }

        const container = document.getElementById('attributesContainer');
        container.innerHTML = '';

        attributes?.forEach(attr => {
            const id = Date.now() + Math.random();
            const html = `
                <div class="attribute-item" id="attr_${id}">
                    <input type="text" value="${escapeHtml(attr.attribute_name)}" placeholder="Attribute Name" class="attr-name" style="flex: 2;">
                    <select class="attr-type" style="flex: 1;">
                        <option value="text" ${attr.attribute_type === 'text' ? 'selected' : ''}>Text</option>
                        <option value="number" ${attr.attribute_type === 'number' ? 'selected' : ''}>Number</option>
                        <option value="boolean" ${attr.attribute_type === 'boolean' ? 'selected' : ''}>Yes/No</option>
                        <option value="select" ${attr.attribute_type === 'select' ? 'selected' : ''}>Select</option>
                        <option value="multiselect" ${attr.attribute_type === 'multiselect' ? 'selected' : ''}>Multi Select</option>
                    </select>
                    <input type="text" value="${attr.attribute_options ? attr.attribute_options.join(', ') : ''}" placeholder="Options (comma separated)" class="attr-options" style="flex: 2;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeAttribute(${id})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    } catch (error) {
        console.log('Attributes feature not available yet');
    }
}

function resetCategoryForm() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('parentId').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('bannerPreview').innerHTML = '';
    document.getElementById('attributesContainer').innerHTML = '';
    document.getElementById('isActive').checked = true;
    document.getElementById('displayInMenu').checked = true;
    
    // Reset icon selection
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
    
    // Clear file inputs
    document.getElementById('imageUpload').value = '';
    document.getElementById('bannerUpload').value = '';
}

async function saveCategory(event) {
    event.preventDefault();

    try {
        const categoryData = {
            name: document.getElementById('name').value,
            slug: document.getElementById('slug').value,
            description: document.getElementById('description').value || null,
            parent_id: document.getElementById('parentId').value || null,
            display_order: parseInt(document.getElementById('displayOrder').value) || 0,
            icon: document.getElementById('icon').value || 'tag',
            display_name: document.getElementById('displayName').value || null,
            color_hex: document.getElementById('colorHex').value || '#0B4F6C',
            is_active: document.getElementById('isActive').checked,
            display_in_menu: document.getElementById('displayInMenu').checked,
            featured: document.getElementById('featured').checked,
            image_url: document.getElementById('imageUrl').value || null,
            banner_url: document.getElementById('bannerUrl').value || null,
            meta_title: document.getElementById('metaTitle').value || null,
            meta_description: document.getElementById('metaDescription').value || null,
            seo_keywords: document.getElementById('seoKeywords').value ? 
                document.getElementById('seoKeywords').value.split(',').map(k => k.trim()).filter(k => k) : []
        };

        const categoryId = document.getElementById('categoryId').value;
        const { data: { user } } = await sb.auth.getUser();

        if (categoryId) {
            // Update
            delete categoryData.created_at;
            categoryData.updated_at = new Date().toISOString();
            categoryData.updated_by = user?.id;

            const { error } = await sb
                .from('categories')
                .update(categoryData)
                .eq('id', categoryId);

            if (error) throw error;
            
            // Save attributes
            if (document.querySelectorAll('.attribute-item').length > 0) {
                await saveAttributes(categoryId);
            }
            
            showToast('Category updated successfully', 'success');
        } else {
            // Insert
            categoryData.created_at = new Date().toISOString();
            categoryData.created_by = user?.id;

            const { data, error } = await sb
                .from('categories')
                .insert([categoryData])
                .select();

            if (error) throw error;
            
            if (data && data[0] && document.querySelectorAll('.attribute-item').length > 0) {
                // Save attributes
                await saveAttributes(data[0].id);
            }
            
            showToast('Category created successfully', 'success');
        }

        closeCategoryModal();
        await loadCategories();

    } catch (error) {
        console.error('Error saving category:', error);
        showToast('Error saving category: ' + error.message, 'error');
    }
}

async function saveAttributes(categoryId) {
    const attributeItems = document.querySelectorAll('.attribute-item');
    const attributes = [];

    attributeItems.forEach((item, index) => {
        const name = item.querySelector('.attr-name')?.value;
        const type = item.querySelector('.attr-type')?.value;
        const options = item.querySelector('.attr-options')?.value;

        if (name && type) {
            attributes.push({
                category_id: categoryId,
                attribute_name: name,
                attribute_type: type,
                attribute_options: options ? options.split(',').map(o => o.trim()) : null,
                display_order: index
            });
        }
    });

    if (attributes.length > 0) {
        try {
            // Check if table exists first
            const { error: checkError } = await sb
                .from('category_attributes')
                .select('id')
                .limit(1);

            if (checkError && checkError.code === 'PGRST205') {
                showToast('Attributes table not configured yet', 'warning');
                return;
            }

            // Delete existing attributes
            await sb
                .from('category_attributes')
                .delete()
                .eq('category_id', categoryId);

            // Insert new attributes
            const { error } = await sb
                .from('category_attributes')
                .insert(attributes);

            if (error) throw error;
        } catch (error) {
            console.error('Error saving attributes:', error);
            showToast('Error saving attributes', 'error');
        }
    }
}

// Delete Operations
function deleteCategory(id, name) {
    currentDeleteId = id;
    currentDeleteName = name;
    document.getElementById('deleteMessage').innerHTML = `Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?`;
    document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    currentDeleteId = null;
}

async function confirmDelete() {
    if (!currentDeleteId) return;

    try {
        // Check if category has children
        const { data: children } = await sb
            .from('categories')
            .select('id')
            .eq('parent_id', currentDeleteId);

        if (children && children.length > 0) {
            showToast('Cannot delete category with subcategories', 'error');
            closeDeleteModal();
            return;
        }

        const { error } = await sb
            .from('categories')
            .delete()
            .eq('id', currentDeleteId);

        if (error) throw error;

        showToast('Category deleted successfully', 'success');
        closeDeleteModal();
        await loadCategories();

    } catch (error) {
        console.error('Error deleting category:', error);
        showToast('Error deleting category', 'error');
    }
}

// Modal Controls
function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('show');
}

function openBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.add('show');
}

function closeBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.remove('show');
    document.getElementById('uploadPreview').innerHTML = '';
    window.uploadedCategories = null;
}

// Bulk Upload
function downloadTemplate() {
    const csv = 'name,slug,parent_id,description,icon,display_order,is_active\n"Electronics","electronics",,"Electronics category","mobile-alt",1,true\n"Phones","phones",1,"Smartphones","phone",1,true';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'category_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function uploadCSV(input) {
    const file = input.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            const preview = document.getElementById('uploadPreview');
            preview.innerHTML = `
                <h4>Preview (${results.data.length} categories)</h4>
                <pre style="max-height: 200px; overflow-y: auto; background: var(--gray-100); padding: 10px; border-radius: 4px; font-size: 12px;">
                    ${JSON.stringify(results.data.slice(0, 5), null, 2)}
                </pre>
            `;
            
            // Store data for processing
            window.uploadedCategories = results.data;
        },
        error: function(error) {
            showToast('Error parsing CSV: ' + error.message, 'error');
        }
    });
}

async function processBulkUpload() {
    if (!window.uploadedCategories || window.uploadedCategories.length === 0) {
        showToast('No data to upload', 'error');
        return;
    }

    try {
        const { data: { user } } = await sb.auth.getUser();
        
        const categories = window.uploadedCategories.map(cat => ({
            name: cat.name,
            slug: cat.slug || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            parent_id: cat.parent_id || null,
            description: cat.description || null,
            icon: cat.icon || 'tag',
            display_order: parseInt(cat.display_order) || 0,
            is_active: cat.is_active === 'true' || cat.is_active === true,
            created_by: user?.id,
            created_at: new Date().toISOString()
        }));

        const { error } = await sb
            .from('categories')
            .insert(categories);

        if (error) throw error;

        showToast(`Successfully imported ${categories.length} categories`, 'success');
        closeBulkUploadModal();
        await loadCategories();

    } catch (error) {
        console.error('Error bulk uploading:', error);
        showToast('Error processing upload', 'error');
    }
}

// Tree Controls
function expandAll() {
    document.querySelectorAll('.children-container').forEach(el => {
        el.style.display = 'block';
    });
}

function collapseAll() {
    document.querySelectorAll('.children-container').forEach(el => {
        el.style.display = 'none';
    });
}

// Search
function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.category-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const node = item.closest('.category-node');
        if (text.includes(term)) {
            node.style.display = 'block';
            // Show all parents
            let parent = node.parentElement.closest('.category-node');
            while (parent) {
                parent.style.display = 'block';
                parent = parent.parentElement.closest('.category-node');
            }
        } else {
            node.style.display = 'none';
        }
    });
}

// Edit Category (wrapper function)
function editCategory(id) {
    openCategoryModal(id);
}

// Utility Functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    // Set color based on type
    const colors = {
        success: 'var(--secondary)',
        error: 'var(--danger)',
        info: 'var(--primary)',
        warning: 'var(--warning)'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Make functions globally available
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.openBulkUploadModal = openBulkUploadModal;
window.closeBulkUploadModal = closeBulkUploadModal;
window.addSubcategory = addSubcategory;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.saveCategory = saveCategory;
window.generateSlug = generateSlug;
window.updateParentId = updateParentId;
window.selectIcon = selectIcon;
window.addAttribute = addAttribute;
window.removeAttribute = removeAttribute;
window.triggerFileUpload = triggerFileUpload;
window.handleImageUpload = handleImageUpload;
window.removeImage = removeImage;
window.expandAll = expandAll;
window.collapseAll = collapseAll;
window.downloadTemplate = downloadTemplate;
window.uploadCSV = uploadCSV;
window.processBulkUpload = processBulkUpload;