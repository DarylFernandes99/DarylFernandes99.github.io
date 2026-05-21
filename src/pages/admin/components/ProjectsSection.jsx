import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Card,
    Grid,
    TextField,
    Button,
    Switch,
    MenuItem,
    Chip,
    useTheme,
    alpha,
    CircularProgress
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
    getAllProjects,
    createProject,
    updateProject,
    deleteProject,
    updateProjectVisibility,
    refreshProjectData
} from '../../../api/services/projectService';
import {
    getAllProjectCategories,
    createProjectCategory,
    updateProjectCategory,
    deleteProjectCategory
} from '../../../api/services/projectCategoryService';
import { fileToBase64 } from '../../../common/common';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

const ProjectsSection = () => {
    const [projects, setProjects] = useState([]);
    const [tab, setTab] = useState('categories');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [showDetailPage, setShowDetailPage] = useState(false);
    const [showPreview, setShowPreview] = useState(() => {
        // Initialize based on screen width - on for md+ screens, off for smaller screens
        return window.innerWidth >= 960; // MUI's md breakpoint is 960px
    });
    const [isMobile, setIsMobile] = useState(() => {
        // Check if current screen is mobile (using MUI's sm breakpoint of 600px)
        return window.innerWidth < 600;
    });
    const [deleteDialog, setDeleteDialog] = useState({
        open: false,
        item: null,
        type: 'project'
    });
    const [refreshing, setRefreshing] = useState({});
    const [searchText, setSearchText] = useState('');
    const [filteredProjects, setFilteredProjects] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
    // Categories state
    const [categories, setCategories] = useState([]);
    const [catLoading, setCatLoading] = useState(false);
    const [catSaving, setCatSaving] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [categoryForm, setCategoryForm] = useState({ name: '', is_visible: true });
    const [showCategoryForm, setShowCategoryForm] = useState(false);

    const theme = useTheme();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [projectsData, categoriesData] = await Promise.all([
                getAllProjects(),
                getAllProjectCategories()
            ]);
            setProjects(projectsData);
            setCategories(categoriesData);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching projects data:', error);
            toast.error('Failed to load projects data');
            setLoading(false);
        }
    };

    // Initialize filteredProjects with all projects when component mounts
    useEffect(() => {
        setFilteredProjects(projects);
    }, [projects]);

    // Map of categoryId to number of projects
    const categoryIdToProjectCount = useMemo(() => {
        const map = {};
        (projects || []).forEach(p => {
            const cid = p.project_category_id;
            if (!cid) return;
            map[cid] = (map[cid] || 0) + 1;
        });
        return map;
    }, [projects]);

    const handleTabChange = (newTab) => {
        const leavingWithUnsaved = (showForm && newTab !== 'projects') || (showCategoryForm && newTab !== 'categories');
        if (leavingWithUnsaved) {
            if (window.confirm('Changing tabs will discard unsaved changes. Continue?')) {
                setTab(newTab);
                if (showForm) {
                    setShowForm(false);
                    setEditingItem(null);
                }
                if (showCategoryForm) {
                    setShowCategoryForm(false);
                    setEditingCategoryId(null);
                }
            }
        } else {
            setTab(newTab);
        }
    };

    const handleCategoryInputChange = (e) => {
        const { name, value, checked, type } = e.target;
        setCategoryForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleEditCategory = (category) => {
        setEditingCategoryId(category.id);
        setCategoryForm({ name: category.name || '', is_visible: !!category.is_visible });
        setShowCategoryForm(true);
    };

    const resetCategoryForm = () => {
        setEditingCategoryId(null);
        setCategoryForm({ name: '', is_visible: true });
    };

    const handleAddCategory = () => {
        resetCategoryForm();
        setShowCategoryForm(true);
    };

    const handleSaveCategory = async () => {
        if (!categoryForm.name?.trim()) {
            toast.error('Please enter a category name');
            return;
        }
        setCatSaving(true);
        try {
            if (editingCategoryId) {
                const response = await updateProjectCategory(editingCategoryId, categoryForm);
                const saved = response.data;
                setCategories(prev => prev.map(c => c.id === saved.id ? saved : c));
                toast.success('Category updated');
            } else {
                const response = await createProjectCategory(categoryForm);
                const saved = response.data;
                setCategories(prev => [...prev, saved]);
                toast.success('Category created');
            }
            resetCategoryForm();
            setShowCategoryForm(false);
        } catch (error) {
            console.error('Error saving category:', error);
            toast.error('Failed to save category');
        } finally {
            setCatSaving(false);
        }
    };

    const handleToggleCategoryVisibility = async (category) => {
        const updated = { name: category.name, is_visible: !category.is_visible };
        // Optimistic UI update
        setCategories(prev => prev.map(c => c.id === category.id ? { ...c, is_visible: updated.is_visible } : c));
        try {
            await updateProjectCategory(category.id, updated);
        } catch (error) {
            console.error('Error updating category visibility:', error);
            toast.error('Failed to update category visibility');
            // Revert on failure
            setCategories(prev => prev.map(c => c.id === category.id ? { ...c, is_visible: category.is_visible } : c));
        }
    };

    // Handle sorting
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Filter and sort projects
    useEffect(() => {
        let result = [...projects];

        // Apply search filter
        if (searchText) {
            const lowercasedFilter = searchText.toLowerCase();
            result = result.filter(project => {
                return (
                    project.title?.toLowerCase().includes(lowercasedFilter) ||
                    project.description?.toLowerCase().includes(lowercasedFilter) ||
                    project.type?.toLowerCase().includes(lowercasedFilter) ||
                    (project.tags && project.tags.some(tag => tag.toLowerCase().includes(lowercasedFilter)))
                );
            });
        }

        // Apply sorting
        result.sort((a, b) => {
            if (sortConfig.key === 'created_at') {
                const dateA = new Date(a[sortConfig.key]);
                const dateB = new Date(b[sortConfig.key]);
                return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
            }

            if (sortConfig.key === 'category') {
                const catA = categories.find(c => c.id === a.project_category_id)?.name || '';
                const catB = categories.find(c => c.id === b.project_category_id)?.name || '';

                if (sortConfig.direction === 'asc') {
                    return catA.localeCompare(catB);
                }
                return catB.localeCompare(catA);
            }

            const aValue = a[sortConfig.key]?.toString().toLowerCase() || '';
            const bValue = b[sortConfig.key]?.toString().toLowerCase() || '';

            if (sortConfig.direction === 'asc') {
                return aValue.localeCompare(bValue);
            }
            return bValue.localeCompare(aValue);
        });

        setFilteredProjects(result);
    }, [projects, searchText, sortConfig]);

    // Simple function to convert markdown to HTML
    const convertMarkdownToHtml = (markdown) => {
        if (!markdown) return '';

        // Replace ** for bold
        let html = markdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Replace * for italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Replace ` for code
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');

        // Replace [text](url) for links
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Replace headers
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');

        // Replace lists (basic)
        html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>\n*)+/g, '<ul>$&</ul>');

        // Replace new lines with breaks
        html = html.replace(/\n/g, '<br />');

        return html;
    };

    // State for tags input
    const [currentTag, setCurrentTag] = useState('');

    // New project template
    const emptyProject = {
        title: '',
        description: '',
        type: 'github', // Default type
        image: '',
        tags: [],
        url: '',
        detail_page: '', // Add this new field
        is_visible: true,
        project_category_id: null
    };

    const [newProject, setNewProject] = useState(emptyProject);

    const handleAddProject = () => {
        setEditingItem(null);
        setNewProject(emptyProject);
        setShowDetailPage(false);
        setShowForm(true);
    };

    const handleEditProject = (project) => {
        setEditingItem(project.id);

        // Prepare project data for the form
        const projectData = {
            ...project,
            // Make sure tags is an array
            tags: project.tags || []
        };

        // For custom projects with a readme_file in additional_data,
        // toggle on detailed view and show the content
        if (project.type === 'custom' &&
            project.additional_data &&
            project.additional_data.readme_file) {

            // Set the detail_page content from readme_file
            projectData.detail_page = project.additional_data.readme_file;

            // Toggle on detailed view
            setShowDetailPage(true);
        } else {
            // Otherwise, only enable detail page if detail_page field exists
            setShowDetailPage(!!project.detail_page);
        }

        setNewProject(projectData);
        setShowForm(true);
    };

    const handleDeleteClick = (item, type = 'project') => {
        setDeleteDialog({
            open: true,
            item,
            type
        });
    };

    const handleDeleteConfirm = async () => {
        const { item, type } = deleteDialog;
        if (!item) return;

        setSaving(true);
        try {
            if (type === 'category') {
                await deleteProjectCategory(item.id);
                setCategories(prev => prev.filter(c => c.id !== item.id));
                toast.success('Category deleted successfully');
            } else {
                await deleteProject(item.id);
                setProjects(prev => prev.filter(project => project.id !== item.id));
                toast.success('Project deleted successfully');
            }
        } catch (error) {
            console.error(`Error deleting ${type}:`, error);
            toast.error(`Failed to delete ${type}`);
        } finally {
            setSaving(false);
            setDeleteDialog({ open: false, item: null, type: 'project' });
        }
    };

    const handleCloseDeleteDialog = () => {
        setDeleteDialog({ open: false, item: null, type: 'project' });
    };

    const handleToggleVisibility = async (index) => {
        const project = projects[index];
        const newVisibility = !project.is_visible;

        // Update local state immediately for better UX
        setProjects(prevProjects =>
            prevProjects.map((p, i) =>
                i === index ? { ...p, is_visible: newVisibility } : p
            )
        );

        try {
            // Call API to update visibility
            await updateProjectVisibility(project.id, newVisibility);
        } catch (error) {
            console.error('Error updating project visibility:', error);
            toast.error('Failed to update project visibility');

            // Revert local state on error
            setProjects(prevProjects =>
                prevProjects.map((p, i) =>
                    i === index ? { ...p, is_visible: !newVisibility } : p
                )
            );
        }
    };

    const handleProjectChange = (e) => {
        const { name, value, checked, type } = e.target;

        // Update the project data
        setNewProject(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (name === 'project_category_id' ? (value || null) : value)
        }));

        // If changing project type to GitHub, automatically turn off detail page
        if (name === 'type' && value === 'github') {
            setShowDetailPage(false);
        }
    };

    const handleAddTag = () => {
        if (currentTag.trim() === '') return;

        // Check if we've already reached the maximum of 2 tags
        if (newProject.tags.length >= 2) {
            toast.warning('Maximum 2 tags allowed per project');
            return;
        }

        // Add the tag if it's not already in the array
        if (!newProject.tags.includes(currentTag.trim())) {
            setNewProject(prev => ({
                ...prev,
                tags: [...prev.tags, currentTag.trim()]
            }));
        }

        // Clear the tag input
        setCurrentTag('');
    };

    const handleRemoveTag = (tagToRemove) => {
        setNewProject(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Convert the selected image to base64
                const base64 = await fileToBase64(file);
                setNewProject(prev => ({
                    ...prev,
                    image: base64
                }));
                toast.success('Project image uploaded successfully!');
            } catch (error) {
                console.error('Error converting image to base64:', error);
                toast.error('Failed to upload project image');
            }
        }
    };

    // Create a ref for the image upload input
    const fileInputRef = useRef(null);

    const triggerFileInput = () => {
        fileInputRef.current.click();
    };

    const handleSaveProject = async () => {
        // Validate required fields
        if (!newProject.title) {
            toast.error('Please enter a title');
            return;
        }

        if (!newProject.description) {
            toast.error('Please enter a description');
            return;
        }

        if (newProject.type === 'github' && !newProject.url) {
            toast.error('Please enter a GitHub URL');
            return;
        }

        setSaving(true);
        try {
            // Prepare project data with additional_data if needed
            const projectData = { ...newProject };

            // For custom projects, store detail_page content in additional_data.readme_file
            if (projectData.type === 'custom') {
                // Initialize additional_data if it doesn't exist
                if (!projectData.additional_data) {
                    projectData.additional_data = {};
                }

                // Set readme_file to the detail_page content
                projectData.additional_data.readme_file = projectData.detail_page || '';
            }

            // Remove detail_page from projectData to keep the database payload clean
            delete projectData.detail_page;

            let response;

            if (editingItem) {
                // Update existing project
                response = await updateProject(editingItem, projectData);
            } else {
                // Create new project
                response = await createProject(projectData);
            }

            const savedProject = response.data;

            // Update projects array
            if (editingItem) {
                setProjects(prev =>
                    prev.map(project => project.id === editingItem ? savedProject : project)
                );
            } else {
                setProjects(prev => [...prev, savedProject]);
            }

            toast.success(`Project ${editingItem ? 'updated' : 'created'} successfully`);
            setShowForm(false);
            setEditingItem(null);
        } catch (error) {
            console.error('Error saving project:', error);
            toast.error('Failed to save project');
        } finally {
            setSaving(false);
        }
    };

    // Update effect to also check mobile state on resize
    useEffect(() => {
        const handleResize = () => {
            // Update mobile state
            setIsMobile(window.innerWidth < 600);

            // Only auto-change preview if form is not open to avoid disrupting user
            if (!showForm) {
                setShowPreview(window.innerWidth >= 960);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [showForm]);

    const handleRefreshProject = async (projectId) => {
        setRefreshing(prev => ({ ...prev, [projectId]: true }));

        try {
            // Use refreshProjectData from the service instead of direct fetch
            await refreshProjectData(projectId);

            // Get updated project data
            const updatedProjects = await getAllProjects();
            setProjects(updatedProjects);

            toast.success('Project refreshed successfully');
        } catch (error) {
            console.error('Error refreshing project:', error);
            toast.error('Failed to refresh project');
        } finally {
            setRefreshing(prev => ({ ...prev, [projectId]: false }));
        }
    };

    if (loading && projects.length === 0 && categories.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            {/* Tabs header for Projects vs Categories */}
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, mb: 2, p: 0.5, display: 'inline-flex', position: 'relative' }}>
                {['categories', 'projects'].map((t) => (
                    <Box
                        key={t}
                        onClick={() => handleTabChange(t)}
                        sx={{
                            position: 'relative',
                            zIndex: 1,
                            px: 2,
                            py: 0.75,
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            fontWeight: tab === t ? 600 : 400,
                            color: tab === t ? 'primary.contrastText' : 'text.primary',
                            transition: 'color 0.2s',
                            userSelect: 'none',
                            borderRadius: 1
                        }}
                    >
                        {tab === t && (
                            <Box
                                component={motion.div}
                                layoutId="activeProjectTab"
                                sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    bgcolor: 'primary.main',
                                    borderRadius: 1,
                                    zIndex: -1,
                                    boxShadow: 2
                                }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        {t}
                    </Box>
                ))}
            </Box>

            <AnimatePresence mode="wait">

                {/* Project Categories Manager */}
                {tab === 'categories' && (
                    <motion.div
                        key="categories"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                    >
                        {showCategoryForm ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                <Card sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="h6" gutterBottom>
                                        {editingCategoryId ? 'Edit Category' : 'Add Category'}
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={6}>
                                            <TextField
                                                fullWidth
                                                required
                                                label="Category Name"
                                                name="name"
                                                value={categoryForm.name}
                                                onChange={handleCategoryInputChange}
                                                margin="normal"
                                                variant="outlined"
                                            />
                                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, mb: 2 }}>
                                                <Switch
                                                    checked={categoryForm.is_visible}
                                                    onChange={handleCategoryInputChange}
                                                    name="is_visible"
                                                    color="success"
                                                />
                                                <Typography sx={{ ml: 1 }}>Visible</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Button
                                                    variant="outlined"
                                                    color="inherit"
                                                    onClick={() => setShowCategoryForm(false)}
                                                    disabled={catSaving}
                                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={handleSaveCategory}
                                                    disabled={catSaving || !categoryForm.name?.trim()}
                                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                                >
                                                    {catSaving ? 'Saving...' : (editingCategoryId ? 'Update' : 'Create') + ' Category'}
                                                </Button>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Card>
                            </motion.div>
                        ) : (
                            <>
                                <TableContainer sx={{ maxHeight: 520, overflowY: 'auto' }}>
                                    <Table stickyHeader>
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                <TableCell width="100px">Actions</TableCell>
                                                <TableCell width="200px">Name</TableCell>
                                                <TableCell width="100px">Projects</TableCell>
                                                <TableCell width="100px">Visible</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {catLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center">Loading...</TableCell>
                                                </TableRow>
                                            ) : categories.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center">No categories found</TableCell>
                                                </TableRow>
                                            ) : (
                                                categories.map((category) => (
                                                    <TableRow
                                                        key={category.id}
                                                        component={motion.tr}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', gap: '2px' }}>
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => handleDeleteClick(category, 'category')}
                                                                >
                                                                    <DeleteIcon />
                                                                </IconButton>
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() => handleEditCategory(category)}
                                                                >
                                                                    <EditIcon />
                                                                </IconButton>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell>{category.name}</TableCell>
                                                        <TableCell>{categoryIdToProjectCount[category.id] || 0}</TableCell>
                                                        <TableCell>
                                                            <Switch
                                                                checked={!!category.is_visible}
                                                                onChange={() => handleToggleCategoryVisibility(category)}
                                                                color="success"
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <Box
                                    component={motion.div}
                                    whileHover={{ scale: 1.01, backgroundColor: alpha(theme.palette.primary.main, 0.05) }}
                                    whileTap={{ scale: 0.99 }}
                                    sx={{
                                        mt: 2,
                                        p: 2,
                                        border: '1px dashed',
                                        borderColor: 'primary.main',
                                        borderRadius: 2,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onClick={handleAddCategory}
                                >
                                    <AddIcon color="primary" />
                                    <Typography color="primary" sx={{ ml: 1, fontWeight: 600 }}>
                                        Add Category
                                    </Typography>
                                </Box>
                            </>
                        )}
                    </motion.div>
                )}

                {tab === 'projects' && (
                    <motion.div
                        key="projects"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                    >
                        {showForm ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                <Card sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="h6" gutterBottom>
                                        {editingItem ? 'Edit Project' : 'Add Project'}
                                    </Typography>

                                    <Grid container spacing={2}>

                                        <Grid item xs={12}>
                                            <Typography variant="subtitle1" gutterBottom>
                                                Project Image
                                            </Typography>
                                            <Box sx={{ mb: 2 }}>
                                                <Box
                                                    sx={{
                                                        width: '100%',
                                                        height: 200,
                                                        maxWidth: 350,
                                                        bgcolor: 'action.hover',
                                                        border: 1,
                                                        borderColor: 'divider',
                                                        borderRadius: 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        mb: 2,
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    {newProject.image ? (
                                                        <img
                                                            src={newProject.image}
                                                            alt="Project"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <Box sx={{ textAlign: 'center' }}>
                                                            <AddIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
                                                            <Typography color="text.secondary">No image selected</Typography>
                                                        </Box>
                                                    )}
                                                </Box>

                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    style={{ display: 'none' }}
                                                    accept="image/*"
                                                    onChange={handleImageUpload}
                                                />

                                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                    <Button
                                                        variant="contained"
                                                        color="secondary"
                                                        onClick={triggerFileInput}
                                                        sx={{ color: 'white' }}
                                                    >
                                                        {newProject.image ? 'Change Image' : 'Upload Image'}
                                                    </Button>

                                                    {newProject.image && (
                                                        <Button
                                                            variant="outlined"
                                                            color="error"
                                                            onClick={() => setNewProject(prev => ({ ...prev, image: '' }))}
                                                        >
                                                            Remove Image
                                                        </Button>
                                                    )}
                                                </Box>
                                            </Box>
                                        </Grid>

                                        <Grid item xs={12} md={6}>
                                            <TextField
                                                fullWidth
                                                required
                                                label="Project Title"
                                                name="title"
                                                value={newProject.title}
                                                onChange={handleProjectChange}
                                                margin="normal"
                                                variant="outlined"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <TextField
                                                select
                                                fullWidth
                                                label="Project Type"
                                                name="type"
                                                value={newProject.type}
                                                onChange={handleProjectChange}
                                                margin="normal"
                                                variant="outlined"
                                            >
                                                <MenuItem value="github">GitHub Repository</MenuItem>
                                                <MenuItem value="custom">Custom Project</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <TextField
                                                select
                                                fullWidth
                                                label="Category"
                                                name="project_category_id"
                                                value={newProject.project_category_id || ''}
                                                onChange={handleProjectChange}
                                                margin="normal"
                                                variant="outlined"
                                            >
                                                <MenuItem value="">
                                                    <em>None</em>
                                                </MenuItem>
                                                {categories.map((category) => (
                                                    <MenuItem key={category.id} value={category.id}>
                                                        {category.name}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <TextField
                                                fullWidth
                                                required={newProject.type === 'github'}
                                                label={newProject.type === 'github' ? "GitHub URL" : "Project URL (Optional)"}
                                                name="url"
                                                value={newProject.url}
                                                onChange={handleProjectChange}
                                                margin="normal"
                                                variant="outlined"
                                                placeholder={newProject.type === 'github' ? "https://github.com/username/repo" : "https://example.com"}
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                fullWidth
                                                required
                                                label="Short Description"
                                                name="description"
                                                value={newProject.description}
                                                onChange={handleProjectChange}
                                                margin="normal"
                                                variant="outlined"
                                                multiline
                                                rows={2}
                                                helperText="Brief summary shown on the project card"
                                            />
                                        </Grid>

                                        <Grid item xs={12}>
                                            <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
                                                Tags (Max 2)
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                                                {newProject.tags.map((tag, index) => (
                                                    <Chip
                                                        key={index}
                                                        label={tag}
                                                        onDelete={() => handleRemoveTag(tag)}
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <TextField
                                                    size="small"
                                                    label="Add Tag"
                                                    value={currentTag}
                                                    onChange={(e) => setCurrentTag(e.target.value)}
                                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                                    disabled={newProject.tags.length >= 2}
                                                    sx={{ flexGrow: 1 }}
                                                />
                                                <Button
                                                    variant="outlined"
                                                    onClick={handleAddTag}
                                                    disabled={!currentTag.trim() || newProject.tags.length >= 2}
                                                >
                                                    Add
                                                </Button>
                                            </Box>
                                        </Grid>

                                        <Grid item xs={12}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                                <Switch
                                                    checked={newProject.is_visible}
                                                    onChange={handleProjectChange}
                                                    name="is_visible"
                                                    color="success"
                                                />
                                                <Typography sx={{ ml: 1 }}>Visible on portfolio</Typography>
                                            </Box>
                                        </Grid>

                                        <Grid item xs={12}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, mb: 1 }}>
                                                <Switch
                                                    checked={showDetailPage}
                                                    onChange={(e) => setShowDetailPage(e.target.checked)}
                                                    color="primary"
                                                    disabled={newProject.type === 'github'}
                                                />
                                                <Box>
                                                    <Typography sx={{ ml: 1, fontWeight: 500 }}>
                                                        Enable Detailed Project Page
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1, display: 'block' }}>
                                                        {newProject.type === 'github'
                                                            ? "Not available for GitHub projects (uses README from GitHub)"
                                                            : "Create a custom detailed page with Markdown support"}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Grid>

                                        {showDetailPage && (
                                            <Grid item xs={12}>
                                                <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                                                    Detailed Content (Markdown)
                                                </Typography>
                                                <Grid container spacing={2}>
                                                    <Grid item xs={12} md={showPreview ? 6 : 12}>
                                                        <TextField
                                                            fullWidth
                                                            multiline
                                                            rows={15}
                                                            label="Markdown Content"
                                                            name="detail_page"
                                                            value={newProject.detail_page || ''}
                                                            onChange={handleProjectChange}
                                                            variant="outlined"
                                                            placeholder="# Project Title\n\n## Overview\nDescribe your project here...\n\n## Features\n- Feature 1\n- Feature 2"
                                                            sx={{
                                                                fontFamily: 'monospace',
                                                                '& .MuiInputBase-input': {
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.9rem'
                                                                }
                                                            }}
                                                        />
                                                    </Grid>

                                                    {/* Preview Toggle for Mobile */}
                                                    {isMobile && (
                                                        <Grid item xs={12}>
                                                            <Button
                                                                variant="outlined"
                                                                fullWidth
                                                                onClick={() => setShowPreview(!showPreview)}
                                                                sx={{ mb: 1 }}
                                                            >
                                                                {showPreview ? "Hide Preview" : "Show Preview"}
                                                            </Button>
                                                        </Grid>
                                                    )}

                                                    {/* Preview Panel */}
                                                    {showPreview && (
                                                        <Grid item xs={12} md={6}>
                                                            <Card variant="outlined" sx={{ height: '100%', maxHeight: '400px', overflow: 'auto' }}>
                                                                <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
                                                                    <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                                                                        PREVIEW
                                                                    </Typography>
                                                                    <div
                                                                        className="markdown-preview"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html: convertMarkdownToHtml(newProject.detail_page) || '<p><em>Nothing to preview</em></p>'
                                                                        }}
                                                                        style={{
                                                                            fontFamily: theme.typography.fontFamily,
                                                                            lineHeight: 1.6
                                                                        }}
                                                                    />
                                                                </Box>
                                                            </Card>
                                                        </Grid>
                                                    )}
                                                </Grid>
                                            </Grid>
                                        )}

                                        <Grid item xs={12}>
                                            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                                                <Button
                                                    variant="outlined"
                                                    color="inherit"
                                                    onClick={() => setShowForm(false)}
                                                    disabled={saving}
                                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={handleSaveProject}
                                                    disabled={saving}
                                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                                >
                                                    {saving ? 'Saving...' : editingItem ? 'Update' : 'Add'}
                                                </Button>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Card>
                            </motion.div>
                        ) : (
                            <>
                                <Box sx={{ width: '100%', mb: 2 }}>
                                    <TextField
                                        label="Search projects"
                                        variant="outlined"
                                        size="small"
                                        fullWidth
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        placeholder="Search by title, description, or tags"
                                        InputProps={{
                                            endAdornment: searchText && (
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setSearchText('')}
                                                    edge="end"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            ),
                                        }}
                                    />
                                </Box>

                                <TableContainer sx={{ maxHeight: 520, overflowY: 'auto' }}>
                                    <Table stickyHeader>
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                <TableCell width="120px">Actions</TableCell>
                                                <TableCell onClick={() => handleSort('title')} sx={{ cursor: 'pointer' }}>
                                                    Title
                                                    {sortConfig.key === 'title' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                                </TableCell>
                                                <TableCell
                                                    width="150px"
                                                    onClick={() => handleSort('category')}
                                                    sx={{ cursor: 'pointer' }}
                                                >
                                                    Category
                                                    {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                                </TableCell>
                                                <TableCell
                                                    width="100px"
                                                    onClick={() => handleSort('type')}
                                                    sx={{ cursor: 'pointer' }}
                                                >
                                                    Type
                                                    {sortConfig.key === 'type' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                                </TableCell>
                                                <TableCell onClick={() => handleSort('created_at')} sx={{ cursor: 'pointer', width: '120px' }}>
                                                    Date
                                                    {sortConfig.key === 'created_at' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                                </TableCell>
                                                <TableCell width="80px">Visible</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredProjects.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center">
                                                        No projects found
                                                    </TableCell>
                                                </TableRow>
                                            ) : filteredProjects.map((project, index) => (
                                                <TableRow
                                                    key={project.id}
                                                    component={motion.tr}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', gap: '4px' }}>
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => handleDeleteClick(project)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton
                                                                size="small"
                                                                color="primary"
                                                                onClick={() => handleEditProject(project)}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                            {project.type === 'github' && (
                                                                <IconButton
                                                                    size="small"
                                                                    color="info"
                                                                    onClick={() => handleRefreshProject(project.id)}
                                                                    disabled={refreshing[project.id]}
                                                                    title="Refresh from GitHub"
                                                                >
                                                                    <RefreshIcon
                                                                        fontSize="small"
                                                                        sx={{
                                                                            animation: refreshing[project.id] ? 'spin 1s linear infinite' : 'none',
                                                                            '@keyframes spin': {
                                                                                '0%': { transform: 'rotate(0deg)' },
                                                                                '100%': { transform: 'rotate(360deg)' }
                                                                            }
                                                                        }}
                                                                    />
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {project.title}
                                                            </Typography>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        {project.project_category_id ? (
                                                            <Chip
                                                                label={categories.find(c => c.id === project.project_category_id)?.name || 'Unknown'}
                                                                size="small"
                                                                variant="outlined"
                                                            />
                                                        ) : (
                                                            <Typography variant="caption" color="text.secondary">-</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={project.type === 'github' ? 'GitHub' : 'Custom'}
                                                            size="small"
                                                            color={project.type === 'github' ? 'default' : 'secondary'}
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {new Date(project.created_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={project.is_visible}
                                                            onChange={() => handleToggleVisibility(projects.indexOf(project))}
                                                            color="success"
                                                            size="small"
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                <Box
                                    component={motion.div}
                                    whileHover={{ scale: 1.01, backgroundColor: alpha(theme.palette.primary.main, 0.05) }}
                                    whileTap={{ scale: 0.99 }}
                                    sx={{
                                        mt: 2,
                                        p: 2,
                                        border: '1px dashed',
                                        borderColor: 'primary.main',
                                        borderRadius: 2,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onClick={handleAddProject}
                                >
                                    <AddIcon color="primary" />
                                    <Typography color="primary" sx={{ ml: 1, fontWeight: 600 }}>
                                        Add Project
                                    </Typography>
                                </Box>
                            </>
                        )}
                    </motion.div>
                )}

            </AnimatePresence>

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmationDialog
                open={deleteDialog.open}
                title={deleteDialog.item ? `the ${deleteDialog.type} "${deleteDialog.item.title || deleteDialog.item.name}"` : 'this item'}
                onClose={handleCloseDeleteDialog}
                onConfirm={handleDeleteConfirm}
                isLoading={saving}
            />
        </>
    );
};

export default ProjectsSection;
