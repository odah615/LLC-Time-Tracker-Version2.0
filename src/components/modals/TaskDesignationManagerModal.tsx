import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Layers,
  Plus,
  Trash2,
  X,
  Briefcase,
  Sparkles,
  AlertCircle,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TaskDesignationManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TaskDesignationManagerModal: React.FC<TaskDesignationManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentUser,
    designationTasks,
    designationList,
    addDesignation,
    deleteDesignation,
    addTaskToDesignation,
    removeTaskFromDesignation,
    hasPermission,
  } = useApp();

  const [selectedDesignation, setSelectedDesignation] = useState<string>(
    designationList[0] || 'Agent'
  );
  const [newTaskInput, setNewTaskInput] = useState<string>('');
  const [newDesignationInput, setNewDesignationInput] = useState<string>('');
  const [showAddDesignationForm, setShowAddDesignationForm] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');

  if (!isOpen) return null;

  const currentTasks = designationTasks[selectedDesignation] || [];
  const canManage =
    currentUser.employeeCode.toLowerCase() === 'superadmin' ||
    currentUser.role === 'admin' ||
    hasPermission('canManageTasks');

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    addTaskToDesignation(selectedDesignation, newTaskInput.trim());
    setNewTaskInput('');
  };

  const handleAddDesignation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesignationInput.trim()) return;
    const name = newDesignationInput.trim();
    addDesignation(name, ['On Shift', 'Team Meeting', 'Task Operations']);
    setSelectedDesignation(name);
    setNewDesignationInput('');
    setShowAddDesignationForm(false);
  };

  const filteredDesignations = designationList.filter((d) =>
    d.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div
      id="task-designation-manager-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800"
      >
        <div className="px-6 py-4.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">
                  Designations & Task Options Manager
                </h2>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Admin Control
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Configure role designations and the specific task dropdown options shown on the Desktop Tracker
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden min-h-[460px]">
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50 flex flex-col p-4 space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                Designations ({designationList.length})
              </span>
              {canManage && (
                <button
                  onClick={() => setShowAddDesignationForm((v) => !v)}
                  className="text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="Search designation..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />

            <AnimatePresence>
              {showAddDesignationForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleAddDesignation}
                  className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm space-y-2"
                >
                  <label className="text-[11px] font-bold text-slate-700">Add New Designation:</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Graphic Designer, SEO Specialist"
                    value={newDesignationInput}
                    onChange={(e) => setNewDesignationInput(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="submit"
                      className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddDesignationForm(false)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="space-y-1 overflow-y-auto flex-1 pr-1">
              {filteredDesignations.map((desig) => {
                const isSelected = desig === selectedDesignation;
                const taskCount = (designationTasks[desig] || []).length;
                return (
                  <div
                    key={desig}
                    onClick={() => setSelectedDesignation(desig)}
                    className={`group flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Tag className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{desig}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                          isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {taskCount} tasks
                      </span>
                      {canManage && !['Agent', 'Team Leader', 'Trainer', 'Admin'].includes(desig) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete custom designation "${desig}"?`)) {
                              deleteDesignation(desig);
                              if (selectedDesignation === desig) {
                                setSelectedDesignation('Agent');
                              }
                            }
                          }}
                          className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                            isSelected ? 'text-blue-200 hover:text-white' : 'text-slate-400 hover:text-red-600'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-8 flex flex-col p-6 space-y-4 overflow-y-auto bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">
                    Tasks for <span className="text-blue-600">"{selectedDesignation}"</span>
                  </h3>
                  <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                    {currentTasks.length} active options
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Employees with designation <strong>{selectedDesignation}</strong> will see only these tasks in their Desktop Tracker dropdown.
                </p>
              </div>
            </div>

            {canManage ? (
              <form onSubmit={handleAddTask} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Add new task to ${selectedDesignation}...`}
                  value={newTaskInput}
                  onChange={(e) => setNewTaskInput(e.target.value)}
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all font-medium"
                />
                <button
                  type="submit"
                  disabled={!newTaskInput.trim()}
                  className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Add Task
                </button>
              </form>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>You have view-only access to designation tasks. Contact Super Admin to request editing rights.</span>
              </div>
            )}

            <div className="space-y-2 flex-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Configured Tasks for {selectedDesignation}:</span>
                <span className="text-[11px] font-normal text-slate-400">Click red trash icon to remove</span>
              </label>
              {currentTasks.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-semibold">No tasks configured for this designation yet.</p>
                  <p className="text-[11px] text-slate-400">Type above to add the first task.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto p-1">
                  {currentTasks.map((task, idx) => (
                    <div
                      key={task + idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200 text-slate-800 transition-all text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold truncate">{task}</span>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => {
                            if (currentTasks.length <= 1) {
                              alert('A designation must have at least one task.');
                              return;
                            }
                            removeTaskFromDesignation(selectedDesignation, task);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Remove task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Changes take effect in real-time across the Desktop Tracker software, time logging database, and Google Sheets synchronization.
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Super Admin & Admin Shared Task Hub &bull; LLC-Time-Tracker-V2</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};
