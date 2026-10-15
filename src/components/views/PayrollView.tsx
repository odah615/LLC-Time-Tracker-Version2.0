import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Coins,
  CheckCircle2,
  Search,
  FileSpreadsheet,
  Printer,
  Calendar,
  FileText,
} from 'lucide-react';
import { PayrollRecord } from '../../types';

export const PayrollView: React.FC = () => {
  const {
    payrollRecords,
    updatePayrollStatus,
    updatePayrollRecord,
    bulkProcessPayroll,
    currentUser,
    users,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [payPeriodFilter, setPayPeriodFilter] = useState('Aug 01 - Aug 31, 2026');
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'payroll' | 'attendance'>('payroll');

  const filteredPayroll = payrollRecords.filter((rec) => {
    if (currentUser.role !== 'payroll' && currentUser.role !== 'admin' && rec.userId !== currentUser.id) {
      return false;
    }
    const matchesSearch =
      rec.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPeriod = !payPeriodFilter || rec.payPeriod === payPeriodFilter;
    return matchesSearch && matchesPeriod;
  });

  const totalPayout = filteredPayroll.reduce((acc, p) => acc + p.netPay, 0);

  const augustDays = [
    { date: 'Aug 1, 2026', day: 'Fri', expectedHours: 8, status: 'Complete 8.0 hrs', color: 'emerald' },
    { date: 'Aug 2, 2026', day: 'Sat', expectedHours: 0, status: 'Weekend Off', color: 'slate' },
    { date: 'Aug 3, 2026', day: 'Sun', expectedHours: 0, status: 'Weekend Off', color: 'slate' },
    { date: 'Aug 4, 2026', day: 'Mon', expectedHours: 8, status: 'Complete 8.0 hrs', color: 'emerald' },
    { date: 'Aug 5, 2026', day: 'Tue', expectedHours: 8, status: 'Complete 8.0 hrs (No OT Pay)', color: 'blue' },
  ];

  const handleExportCSV = () => {
    const headers = [
      'Employee Code',
      'Name',
      'Designation',
      'Monthly Rate (PHP)',
      'Daily Rate (PHP)',
      'Hourly Rate (PHP)',
      'Tracked Hours',
      'Missing Hours',
      'Missing Deductions (PHP)',
      'Gross Pay (PHP)',
      'Incentive Bonus (PHP)',
      'Net Pay (PHP)',
      'Status & Remarks',
    ];
    const rows = filteredPayroll.map((p) => [
      p.employeeCode,
      `"${p.userName}"`,
      `"${p.designation}"`,
      p.monthlyRate || 0,
      p.dailyRate || 0,
      p.hourlyRate || 0,
      p.totalTrackedHours,
      p.missingHours || 0,
      p.missingDeductions || 0,
      p.grossPay || 0,
      p.incentiveBonus || 0,
      p.netPay || 0,
      `"${p.remarks || p.status}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `LLC_Payroll_PHP_${payPeriodFilter.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isPayrollAdmin = currentUser.role === 'payroll' || currentUser.role === 'admin';

  return (
    <div id="payroll-view" className="space-y-6">
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              Finance & Payroll Portal (PHP Currency)
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">Monthly Salary & Compensation Suite</h2>
          <p className="text-xs text-slate-300 mt-1">
            Automated calculations, shift hours, missing hour deductions, and payslip generation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPayrollAdmin && (
            <button
              onClick={() => bulkProcessPayroll(payPeriodFilter)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Process Current Month Payroll
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm text-xs font-semibold">
        <button
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'payroll'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Payroll Disbursements (PHP)</span>
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Daily & Monthly Attendance Breakdown</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1">Pay Period Cycle</div>
          <div className="text-lg font-bold text-slate-900">{payPeriodFilter}</div>
          <p className="text-[11px] text-slate-500 mt-1">20 Working Days (160 Hours)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1">Total Net Disbursements</div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">
            ₱ {totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Gross + Incentives - Missing Hours</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1">Calculated Staff Count</div>
          <div className="text-2xl font-extrabold text-slate-900">{filteredPayroll.length} Employees</div>
          <p className="text-[11px] text-slate-500 mt-1">Active staff payroll records</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1">Disbursement Status</div>
          <div className="text-lg font-bold text-emerald-700">
            {filteredPayroll.filter((p) => p.status === 'paid').length} Paid /{' '}
            {filteredPayroll.filter((p) => p.status !== 'paid').length} Pending
          </div>
        </div>
      </div>

      {activeTab === 'payroll' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-3 border-b border-slate-200">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search code, name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Pay Period:</span>
              <select
                value={payPeriodFilter}
                onChange={(e) => setPayPeriodFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-2 font-semibold focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Aug 01 - Aug 31, 2026">Aug 01 - Aug 31, 2026</option>
                <option value="Jul 01 - Jul 31, 2026">Jul 01 - Jul 31, 2026</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3">Designation</th>
                  <th className="py-3 px-3">Rate Structure</th>
                  <th className="py-3 px-3 text-center">Tracked Hours</th>
                  <th className="py-3 px-3 text-right">Missing Hours Ded.</th>
                  <th className="py-3 px-3 text-right">Gross Pay</th>
                  <th className="py-3 px-3 text-center">Incentive Bonus (₱)</th>
                  <th className="py-3 px-3 text-right">Net Payout</th>
                  <th className="py-3 px-3 text-center">Payslip</th>
                  <th className="py-3 px-3 text-center">Status & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredPayroll.map((rec) => {
                  const mRate = Number(rec.monthlyRate) >= 0 ? Number(rec.monthlyRate) : 0;
                  const dRate = rec.dailyRate || (mRate > 0 ? mRate / 20 : 0);
                  const hRate = rec.hourlyRate || (mRate > 0 ? mRate / 160 : 0);
                  const missingHrs = Math.max(0, (rec.expectedHours || 160) - rec.totalTrackedHours);
                  const missingDed = missingHrs * hRate;
                  const bonus = rec.incentiveBonus || 0;
                  const net = mRate > 0 ? Math.max(0, mRate + bonus - missingDed) : 0;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{rec.userName}</div>
                        <div className="text-[10px] text-emerald-700 font-mono font-semibold">#{rec.employeeCode}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-700">
                        {rec.designation}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="font-bold text-slate-900">₱ {mRate.toLocaleString()}/mo</div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                        <div>{rec.totalTrackedHours}h / 160h</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600 font-bold">
                        {missingDed > 0 ? `- ₱ ${missingDed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₱ 0.00'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700">
                        ₱ {mRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isPayrollAdmin ? (
                          <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1 shadow-inner">
                            <span className="text-amber-700 font-bold font-mono text-xs">₱</span>
                            <input
                              type="number"
                              step="100"
                              value={rec.incentiveBonus || 0}
                              onChange={(e) =>
                                updatePayrollRecord(rec.id, {
                                  incentiveBonus: Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="w-20 bg-transparent text-slate-900 font-mono font-bold text-xs outline-none text-right"
                              placeholder="0"
                            />
                          </div>
                        ) : (
                          <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                            + ₱ {(rec.incentiveBonus || 0).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-700 text-sm">
                        ₱ {net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedPayslip({ ...rec, monthlyRate: mRate, dailyRate: dRate, hourlyRate: hRate, missingHours: missingHrs, missingDeductions: missingDed, netPay: net })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all shadow-sm cursor-pointer"
                          title="Generate & Print Official Payslip"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Payslip</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            rec.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : rec.status === 'processing'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {rec.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" /> Daily Attendance Breakdown
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {users.map((usr) => (
              <div key={usr.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{usr.name}</div>
                    <div className="text-[11px] text-slate-500">{usr.designation} • #{usr.employeeCode}</div>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {augustDays.map((day) => (
                    <div key={day.date} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200">
                      <span className="font-mono text-[11px] text-slate-500 font-bold">{day.date}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {day.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-2xl w-full p-8 shadow-2xl text-slate-900 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-lg">
                  LLC
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-900 uppercase tracking-tight">
                    LLC-Time-Tracker-V2
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Official Employee Salary Payslip Statement</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPayslip(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Employee Name</span>
                <strong className="text-slate-900 font-bold text-sm">{selectedPayslip.userName}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Employee Code</span>
                <strong className="text-slate-900 font-mono font-bold text-sm">#{selectedPayslip.employeeCode}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Designation</span>
                <strong className="text-slate-900 font-bold text-sm">{selectedPayslip.designation}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Pay Period</span>
                <strong className="text-emerald-700 font-mono font-bold">{selectedPayslip.payPeriod}</strong>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" /> Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
