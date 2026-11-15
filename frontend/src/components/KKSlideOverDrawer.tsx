import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Edit3,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  addAnggotaToKk,
  ApiError,
  checkNikAvailability,
  deleteAnggota,
  resolveMediaUrl,
  updateAnggota,
  updateKk,
  getKkDetail,
} from "../api/client";
import type {
  AnggotaCreate,
  AnggotaOut,
  KKDetailOut,
  KKUpdate,
} from "../types/kk";
import {
  AGAMA_OPTIONS,
  calculateAgeAndCategory,
  copyTextToClipboard,
  createEmptyAnggotaDraft,
  formatDateIndo,
  formatRtRwDisplay,
  isExact16Digits,
  JENIS_KELAMIN_OPTIONS,
  joinRtRw,
  PENDIDIKAN_OPTIONS,
  splitRtRw,
  STATUS_HUBUNGAN_OPTIONS,
  STATUS_PERKAWINAN_OPTIONS,
} from "../utils/formatters";
import { AgeCategoryBadge } from "./AgeCategoryBadge";
import { ConfirmModal } from "./ConfirmModal";
import { useToast } from "./ToastProvider";

interface KKSlideOverDrawerProps {
  noKk: string | null;
  onClose: () => void;
  onDataChanged: (newNoKk?: string) => void;
}

interface MemberFormState {
  nik: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  agama: string;
  pendidikan: string;
  jenis_pekerjaan: string;
  status_perkawinan: string;
  status_hubungan: string;
  kewarganegaraan: string;
  nama_ayah: string;
  nama_ibu: string;
}

function memberToForm(member: AnggotaOut): MemberFormState {
  return {
    nik: member.nik,
    nama_lengkap: member.nama_lengkap,
    jenis_kelamin: member.jenis_kelamin,
    tempat_lahir: member.tempat_lahir,
    tanggal_lahir: member.tanggal_lahir,
    agama: member.agama,
    pendidikan: member.pendidikan,
    jenis_pekerjaan: member.jenis_pekerjaan,
    status_perkawinan: member.status_perkawinan,
    status_hubungan: member.status_hubungan,
    kewarganegaraan: member.kewarganegaraan,
    nama_ayah: member.nama_ayah,
    nama_ibu: member.nama_ibu,
  };
}

export function KKSlideOverDrawer({
  noKk,
  onClose,
  onDataChanged,
}: KKSlideOverDrawerProps) {
  const { showToast } = useToast();

  const [detail, setDetail] = useState<KKDetailOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showScanPreview, setShowScanPreview] = useState(false);

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState({
    no_kk: "",
    nama_kepala_keluarga: "",
    alamat: "",
    rt: "",
    rw: "",
    desa_kelurahan: "",
    kecamatan: "",
    kabupaten_kota: "",
    kode_pos: "",
    provinsi: "",
  });

  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editMemberForm, setEditMemberForm] = useState<MemberFormState | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<number | null>(null);
  const [inlineNikWarning, setInlineNikWarning] = useState<string | null>(null);

  const [addingMember, setAddingMember] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState<MemberFormState>(() => ({
    ...createEmptyAnggotaDraft(),
    jenis_kelamin: "LAKI-LAKI",
    agama: "ISLAM",
    pendidikan: "SLTA/SEDERAJAT",
    status_perkawinan: "BELUM KAWIN",
    status_hubungan: "ANAK",
  }));
  const [savingNewMember, setSavingNewMember] = useState(false);
  const [newMemberNikWarning, setNewMemberNikWarning] = useState<string | null>(null);

  const [memberToDelete, setMemberToDelete] = useState<AnggotaOut | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  const loadDetail = useCallback(async (targetNoKk: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getKkDetail(targetNoKk);
      setDetail(data);
      const { rt, rw } = splitRtRw(data.rt_rw);
      setIdentityForm({
        no_kk: data.no_kk,
        nama_kepala_keluarga: data.nama_kepala_keluarga,
        alamat: data.alamat,
        rt,
        rw,
        desa_kelurahan: data.desa_kelurahan,
        kecamatan: data.kecamatan,
        kabupaten_kota: data.kabupaten_kota,
        kode_pos: data.kode_pos,
        provinsi: data.provinsi,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Gagal memuat detail Kartu Keluarga."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!noKk) {
      setDetail(null);
      setEditingIdentity(false);
      setEditingMemberId(null);
      setEditMemberForm(null);
      setAddingMember(false);
      setShowScanPreview(false);
      return;
    }
    void loadDetail(noKk);
  }, [noKk, loadDetail]);

  useEffect(() => {
    if (!noKk) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (memberToDelete) return;
      if (editingMemberId !== null) {
        setEditingMemberId(null);
        setEditMemberForm(null);
        setInlineNikWarning(null);
        return;
      }
      if (addingMember) {
        setAddingMember(false);
        setNewMemberNikWarning(null);
        return;
      }
      if (editingIdentity) {
        setEditingIdentity(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [noKk, editingMemberId, addingMember, editingIdentity, memberToDelete, onClose]);

  if (!noKk) return null;

  const handleCopyNoKk = async () => {
    if (!detail) return;
    const ok = await copyTextToClipboard(detail.no_kk);
    if (ok) {
      showToast(`Nomor KK ${detail.no_kk} tersalin.`, "success");
    }
  };

  const handleSaveIdentity = async () => {
    if (!detail) return;
    const cleanNoKk = identityForm.no_kk.replace(/\s+/g, "");
    if (!isExact16Digits(cleanNoKk)) {
      showToast("Nomor KK harus terdiri dari tepat 16 digit angka.", "error");
      return;
    }

    setSavingIdentity(true);
    try {
      const payload: KKUpdate = {
        no_kk: cleanNoKk,
        nama_kepala_keluarga: identityForm.nama_kepala_keluarga.trim(),
        alamat: identityForm.alamat.trim(),
        rt_rw: joinRtRw(identityForm.rt, identityForm.rw),
        desa_kelurahan: identityForm.desa_kelurahan.trim(),
        kecamatan: identityForm.kecamatan.trim(),
        kabupaten_kota: identityForm.kabupaten_kota.trim(),
        kode_pos: identityForm.kode_pos.trim(),
        provinsi: identityForm.provinsi.trim(),
      };
      const updated = await updateKk(detail.no_kk, payload);
      setDetail(updated);
      setEditingIdentity(false);
      showToast("Identitas Kartu Keluarga diperbarui.", "success");
      onDataChanged(updated.no_kk);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Gagal menyimpan identitas KK.",
        "error"
      );
    } finally {
      setSavingIdentity(false);
    }
  };

  const verifyNikConflict = async (
    nik: string,
    excludeId?: number
  ): Promise<string | null> => {
    const cleaned = nik.replace(/\s+/g, "");
    if (!isExact16Digits(cleaned)) {
      return "NIK harus terdiri dari 16 digit angka.";
    }
    try {
      const res = await checkNikAvailability(cleaned, excludeId);
      if (res.exists) {
        return `NIK sudah terdaftar pada KK ${res.existing_no_kk} (${res.existing_nama}).`;
      }
      return null;
    } catch {
      return null;
    }
  };

  const startEditMember = (member: AnggotaOut) => {
    setEditingMemberId(member.id);
    setEditMemberForm(memberToForm(member));
    setInlineNikWarning(null);
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setEditMemberForm(null);
    setInlineNikWarning(null);
  };

  const saveEditMember = async (memberId: number) => {
    if (!editMemberForm || !detail) return;
    const cleanNik = editMemberForm.nik.replace(/\s+/g, "");
    if (!isExact16Digits(cleanNik)) {
      setInlineNikWarning("NIK harus tepat 16 digit angka.");
      return;
    }

    setSavingMemberId(memberId);
    try {
      const updated = await updateAnggota(memberId, {
        ...editMemberForm,
        nik: cleanNik,
        nama_ayah: editMemberForm.nama_ayah.trim() || "-",
        nama_ibu: editMemberForm.nama_ibu.trim() || "-",
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              anggota_keluarga: prev.anggota_keluarga.map((item) =>
                item.id === memberId ? updated : item
              ),
            }
          : prev
      );
      setEditingMemberId(null);
      setEditMemberForm(null);
      setInlineNikWarning(null);
      showToast(`Data ${updated.nama_lengkap} diperbarui.`, "success");
      onDataChanged();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Gagal memperbarui anggota.";
      setInlineNikWarning(message);
      showToast(message, "error");
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    memberId: number
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveEditMember(memberId);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEditMember();
    }
  };

  const handleAddMember = async () => {
    if (!detail) return;
    const cleanNik = newMemberForm.nik.replace(/\s+/g, "");
    if (!isExact16Digits(cleanNik)) {
      setNewMemberNikWarning("NIK harus tepat 16 digit angka.");
      return;
    }

    setSavingNewMember(true);
    try {
      const payload: AnggotaCreate = {
        ...newMemberForm,
        nik: cleanNik,
        nama_ayah: newMemberForm.nama_ayah.trim() || "-",
        nama_ibu: newMemberForm.nama_ibu.trim() || "-",
      };
      const created = await addAnggotaToKk(detail.no_kk, payload);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              anggota_keluarga: [...prev.anggota_keluarga, created],
            }
          : prev
      );
      setAddingMember(false);
      setNewMemberNikWarning(null);
      setNewMemberForm({
        ...createEmptyAnggotaDraft(),
        jenis_kelamin: "LAKI-LAKI",
        agama: "ISLAM",
        pendidikan: "SLTA/SEDERAJAT",
        status_perkawinan: "BELUM KAWIN",
        status_hubungan: "ANAK",
      });
      showToast(`${created.nama_lengkap} ditambahkan ke KK.`, "success");
      onDataChanged();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Gagal menambahkan anggota.";
      setNewMemberNikWarning(message);
      showToast(message, "error");
    } finally {
      setSavingNewMember(false);
    }
  };

  const handleDeleteMemberConfirm = async () => {
    if (!memberToDelete) return;
    setDeletingMember(true);
    try {
      await deleteAnggota(memberToDelete.id);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              anggota_keluarga: prev.anggota_keluarga.filter(
                (item) => item.id !== memberToDelete.id
              ),
            }
          : prev
      );
      showToast(`${memberToDelete.nama_lengkap} dihapus dari KK.`, "success");
      setMemberToDelete(null);
      onDataChanged();
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Gagal menghapus anggota.",
        "error"
      );
    } finally {
      setDeletingMember(false);
    }
  };

  const newMemberAgePreview = calculateAgeAndCategory(newMemberForm.tanggal_lahir);

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex justify-end bg-slate-900/45"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-kk-title"
          className="flex h-full w-[680px] max-w-full flex-col border-l border-slate-200 bg-white"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2
                id="drawer-kk-title"
                className="text-sm font-semibold text-slate-900"
              >
                Detail & Anggota Kartu Keluarga
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-mono tabular-nums text-xs font-medium text-slate-700">
                  No. KK: {detail?.no_kk ?? noKk}
                </span>
                {detail && (
                  <button
                    type="button"
                    onClick={() => void handleCopyNoKk()}
                    aria-label="Salin Nomor KK"
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>Salin</span>
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup panel detail"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 sm:min-h-[34px] sm:min-w-[34px]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {loading && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
                Memuat detail Kartu Keluarga...
              </div>
            )}

            {!loading && errorMsg && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-2.5 text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="flex-1 text-xs">
                    <p className="font-semibold">Gagal memuat detail KK</p>
                    <p className="mt-1">{errorMsg}</p>
                    <button
                      type="button"
                      onClick={() => void loadDetail(noKk)}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-3 py-1.5 font-medium text-red-800 hover:bg-red-100"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Coba Lagi</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!loading && !errorMsg && detail && (
              <div className="space-y-5">
                <div className="rounded-md border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
                    <h3 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                      A. Identitas Kartu Keluarga
                    </h3>
                    <div className="flex items-center gap-2">
                      {detail.file_gambar_path && (
                        <button
                          type="button"
                          onClick={() => setShowScanPreview((prev) => !prev)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{showScanPreview ? "Tutup Scan" : "Lihat Scan"}</span>
                        </button>
                      )}
                      {!editingIdentity && (
                        <button
                          type="button"
                          onClick={() => setEditingIdentity(true)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Edit Identitas</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {showScanPreview && detail.file_gambar_path && (
                    <div className="border-b border-slate-200 bg-slate-100 p-3">
                      <img
                        src={resolveMediaUrl(detail.file_gambar_path)}
                        alt={`Scan Kartu Keluarga ${detail.no_kk}`}
                        width={1000}
                        height={700}
                        className="mx-auto max-h-72 w-auto rounded border border-slate-200 object-contain"
                      />
                    </div>
                  )}

                  {!editingIdentity ? (
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 p-3.5 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] text-slate-500">Nomor KK</dt>
                        <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                          {detail.no_kk}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Kepala Keluarga</dt>
                        <dd className="mt-0.5 font-semibold text-slate-900">
                          {detail.nama_kepala_keluarga}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] text-slate-500">Alamat & RT/RW</dt>
                        <dd className="mt-0.5 text-slate-800">
                          {detail.alamat} ({formatRtRwDisplay(detail.rt_rw)})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Desa / Kelurahan</dt>
                        <dd className="mt-0.5 text-slate-800">{detail.desa_kelurahan}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Kecamatan</dt>
                        <dd className="mt-0.5 text-slate-800">{detail.kecamatan}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Kabupaten / Kota</dt>
                        <dd className="mt-0.5 text-slate-800">{detail.kabupaten_kota}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Kode Pos & Provinsi</dt>
                        <dd className="mt-0.5 text-slate-800">
                          <span className="font-mono tabular-nums">
                            {detail.kode_pos || "-"}
                          </span>{" "}
                          / {detail.provinsi}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="drawer-no-kk"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Nomor KK (16 digit)
                        </label>
                        <input
                          id="drawer-no-kk"
                          type="text"
                          value={identityForm.no_kk}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, no_kk: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-kepala"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Nama Kepala Keluarga
                        </label>
                        <input
                          id="drawer-kepala"
                          type="text"
                          value={identityForm.nama_kepala_keluarga}
                          onChange={(e) =>
                            setIdentityForm((p) => ({
                              ...p,
                              nama_kepala_keluarga: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="drawer-alamat"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Alamat
                        </label>
                        <input
                          id="drawer-alamat"
                          type="text"
                          value={identityForm.alamat}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, alamat: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-rt"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          RT
                        </label>
                        <input
                          id="drawer-rt"
                          type="text"
                          value={identityForm.rt}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, rt: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-rw"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          RW
                        </label>
                        <input
                          id="drawer-rw"
                          type="text"
                          value={identityForm.rw}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, rw: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-kelurahan"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Desa / Kelurahan
                        </label>
                        <input
                          id="drawer-kelurahan"
                          type="text"
                          value={identityForm.desa_kelurahan}
                          onChange={(e) =>
                            setIdentityForm((p) => ({
                              ...p,
                              desa_kelurahan: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-kecamatan"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Kecamatan
                        </label>
                        <input
                          id="drawer-kecamatan"
                          type="text"
                          value={identityForm.kecamatan}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, kecamatan: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-kabupaten"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Kabupaten / Kota
                        </label>
                        <input
                          id="drawer-kabupaten"
                          type="text"
                          value={identityForm.kabupaten_kota}
                          onChange={(e) =>
                            setIdentityForm((p) => ({
                              ...p,
                              kabupaten_kota: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-kodepos"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Kode Pos
                        </label>
                        <input
                          id="drawer-kodepos"
                          type="text"
                          value={identityForm.kode_pos}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, kode_pos: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="drawer-provinsi"
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Provinsi
                        </label>
                        <input
                          id="drawer-provinsi"
                          type="text"
                          value={identityForm.provinsi}
                          onChange={(e) =>
                            setIdentityForm((p) => ({ ...p, provinsi: e.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div className="flex justify-end gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => setEditingIdentity(false)}
                          disabled={savingIdentity}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveIdentity()}
                          disabled={savingIdentity}
                          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
                        >
                          {savingIdentity ? "Menyimpan..." : "Simpan Identitas"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
                    <div>
                      <h3 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                        B. Anggota Keluarga ({detail.anggota_keluarga.length} orang)
                      </h3>
                      <p className="text-[11px] text-slate-600">
                        Klik ikon edit pada baris untuk mengubah langsung; tekan Enter untuk simpan atau Esc untuk batal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingMember((prev) => !prev);
                        setNewMemberNikWarning(null);
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 sm:min-h-0"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{addingMember ? "Tutup Form" : "Tambah Anggota"}</span>
                    </button>
                  </div>

                  {addingMember && (
                    <div className="border-b border-slate-200 bg-slate-50/60 p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">
                          Anggota Keluarga Baru
                        </span>
                        {newMemberAgePreview && (
                          <AgeCategoryBadge
                            kategori={newMemberAgePreview.kategori}
                            umur={newMemberAgePreview.umur}
                          />
                        )}
                      </div>
                      {newMemberNikWarning && (
                        <p className="mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800">
                          {newMemberNikWarning}
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <div>
                          <label
                            htmlFor="new-member-nik"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            NIK (16 digit)
                          </label>
                          <input
                            id="new-member-nik"
                            type="text"
                            value={newMemberForm.nik}
                            onChange={(e) => {
                              setNewMemberForm((p) => ({ ...p, nik: e.target.value }));
                              setNewMemberNikWarning(null);
                            }}
                            onBlur={() => {
                              void verifyNikConflict(newMemberForm.nik).then((warn) =>
                                setNewMemberNikWarning(warn)
                              );
                            }}
                            placeholder="16 digit NIK"
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-nama"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Nama Lengkap
                          </label>
                          <input
                            id="new-member-nama"
                            type="text"
                            value={newMemberForm.nama_lengkap}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                nama_lengkap: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-jk"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Jenis Kelamin
                          </label>
                          <select
                            id="new-member-jk"
                            value={newMemberForm.jenis_kelamin}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                jenis_kelamin: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                          >
                            {JENIS_KELAMIN_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-tempat"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Tempat Lahir
                          </label>
                          <input
                            id="new-member-tempat"
                            type="text"
                            value={newMemberForm.tempat_lahir}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                tempat_lahir: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-tgl"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Tanggal Lahir
                          </label>
                          <input
                            id="new-member-tgl"
                            type="date"
                            value={newMemberForm.tanggal_lahir}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                tanggal_lahir: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-agama"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Agama
                          </label>
                          <select
                            id="new-member-agama"
                            value={newMemberForm.agama}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({ ...p, agama: e.target.value }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                          >
                            {AGAMA_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-pendidikan"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Pendidikan
                          </label>
                          <input
                            id="new-member-pendidikan"
                            list="drawer-pendidikan-list"
                            value={newMemberForm.pendidikan}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                pendidikan: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-pekerjaan"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Jenis Pekerjaan
                          </label>
                          <input
                            id="new-member-pekerjaan"
                            type="text"
                            value={newMemberForm.jenis_pekerjaan}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                jenis_pekerjaan: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-kawin"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Status Perkawinan
                          </label>
                          <select
                            id="new-member-kawin"
                            value={newMemberForm.status_perkawinan}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                status_perkawinan: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                          >
                            {STATUS_PERKAWINAN_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-hubungan"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Status Hubungan
                          </label>
                          <input
                            id="new-member-hubungan"
                            list="drawer-hubungan-list"
                            value={newMemberForm.status_hubungan}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                status_hubungan: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-ayah"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Nama Ayah
                          </label>
                          <input
                            id="new-member-ayah"
                            type="text"
                            value={newMemberForm.nama_ayah}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                nama_ayah: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="new-member-ibu"
                            className="block text-[11px] font-medium text-slate-700"
                          >
                            Nama Ibu
                          </label>
                          <input
                            id="new-member-ibu"
                            type="text"
                            value={newMemberForm.nama_ibu}
                            onChange={(e) =>
                              setNewMemberForm((p) => ({
                                ...p,
                                nama_ibu: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAddingMember(false)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAddMember()}
                          disabled={savingNewMember}
                          className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:bg-blue-400"
                        >
                          {savingNewMember ? "Menyimpan..." : "Simpan Anggota"}
                        </button>
                      </div>
                    </div>
                  )}

                  {inlineNikWarning && editingMemberId !== null && (
                    <div className="border-b border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800">
                      {inlineNikWarning}
                    </div>
                  )}

                  {detail.anggota_keluarga.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-600">
                      Belum ada anggota keluarga tercatat pada KK ini. Klik tombol &ldquo;Tambah Anggota&rdquo; di atas untuk menambahkan.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                          <tr>
                            <th className="px-3 py-2">NIK</th>
                            <th className="px-3 py-2">Nama & JK</th>
                            <th className="px-3 py-2">Lahir & Usia</th>
                            <th className="px-3 py-2">Hubungan / Kawin</th>
                            <th className="px-3 py-2">Pekerjaan / Pend.</th>
                            <th className="px-3 py-2 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {detail.anggota_keluarga.map((member) => {
                            const isEditing = editingMemberId === member.id && editMemberForm !== null;
                            const isSaving = savingMemberId === member.id;

                            if (isEditing && editMemberForm) {
                              const liveAge = calculateAgeAndCategory(editMemberForm.tanggal_lahir);
                              return (
                                <tr key={member.id} className="bg-amber-50/40 align-top">
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      aria-label="Edit NIK"
                                      value={editMemberForm.nik}
                                      onChange={(e) => {
                                        setEditMemberForm((p) =>
                                          p ? { ...p, nik: e.target.value } : p
                                        );
                                        setInlineNikWarning(null);
                                      }}
                                      onBlur={() => {
                                        void verifyNikConflict(
                                          editMemberForm.nik,
                                          member.id
                                        ).then((warn) => setInlineNikWarning(warn));
                                      }}
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-36 rounded border border-slate-300 bg-white px-2 py-1 font-mono tabular-nums text-xs"
                                    />
                                  </td>
                                  <td className="space-y-1 px-2 py-2">
                                    <input
                                      type="text"
                                      aria-label="Edit Nama Lengkap"
                                      value={editMemberForm.nama_lengkap}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, nama_lengkap: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium"
                                    />
                                    <select
                                      aria-label="Edit Jenis Kelamin"
                                      value={editMemberForm.jenis_kelamin}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, jenis_kelamin: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-40 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
                                    >
                                      {JENIS_KELAMIN_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="space-y-1 px-2 py-2">
                                    <input
                                      type="text"
                                      aria-label="Edit Tempat Lahir"
                                      value={editMemberForm.tempat_lahir}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, tempat_lahir: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-32 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    />
                                    <input
                                      type="date"
                                      aria-label="Edit Tanggal Lahir"
                                      value={editMemberForm.tanggal_lahir}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, tanggal_lahir: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-32 rounded border border-slate-300 bg-white px-1.5 py-1 font-mono tabular-nums text-[11px]"
                                    />
                                    {liveAge && (
                                      <div>
                                        <AgeCategoryBadge
                                          kategori={liveAge.kategori}
                                          umur={liveAge.umur}
                                        />
                                      </div>
                                    )}
                                  </td>
                                  <td className="space-y-1 px-2 py-2">
                                    <input
                                      type="text"
                                      list="drawer-hubungan-list"
                                      aria-label="Edit Status Hubungan"
                                      value={editMemberForm.status_hubungan}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, status_hubungan: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    />
                                    <select
                                      aria-label="Edit Status Perkawinan"
                                      value={editMemberForm.status_perkawinan}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, status_perkawinan: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-36 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
                                    >
                                      {STATUS_PERKAWINAN_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="space-y-1 px-2 py-2">
                                    <input
                                      type="text"
                                      aria-label="Edit Pekerjaan"
                                      value={editMemberForm.jenis_pekerjaan}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, jenis_pekerjaan: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    />
                                    <input
                                      type="text"
                                      list="drawer-pendidikan-list"
                                      aria-label="Edit Pendidikan"
                                      value={editMemberForm.pendidikan}
                                      onChange={(e) =>
                                        setEditMemberForm((p) =>
                                          p ? { ...p, pendidikan: e.target.value } : p
                                        )
                                      }
                                      onKeyDown={(e) => handleRowKeyDown(e, member.id)}
                                      className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void saveEditMember(member.id)}
                                        disabled={isSaving}
                                        aria-label="Simpan perubahan baris"
                                        className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:bg-emerald-400"
                                      >
                                        <Check className="h-3 w-3" aria-hidden="true" />
                                        <span>{isSaving ? "..." : "Simpan"}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditMember}
                                        disabled={isSaving}
                                        aria-label="Batal edit baris"
                                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr key={member.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono tabular-nums text-slate-900">
                                  {member.nik}
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-slate-900">
                                    {member.nama_lengkap}
                                  </p>
                                  <p className="text-[11px] text-slate-600">
                                    {member.jenis_kelamin} ({member.agama})
                                  </p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="text-slate-800">
                                    {member.tempat_lahir},{" "}
                                    <span className="font-mono tabular-nums">
                                      {formatDateIndo(member.tanggal_lahir)}
                                    </span>
                                  </p>
                                  <div className="mt-1">
                                    <AgeCategoryBadge
                                      kategori={member.kategori_usia}
                                      umur={member.umur}
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-medium text-slate-800">
                                    {member.status_hubungan}
                                  </p>
                                  <p className="text-[11px] text-slate-600">
                                    {member.status_perkawinan}
                                  </p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="text-slate-800">{member.jenis_pekerjaan}</p>
                                  <p className="text-[11px] text-slate-600">
                                    {member.pendidikan}
                                  </p>
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEditMember(member)}
                                      aria-label={`Edit ${member.nama_lengkap}`}
                                      className="inline-flex min-h-[34px] items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 sm:min-h-0"
                                    >
                                      <Edit3 className="h-3 w-3" aria-hidden="true" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMemberToDelete(member)}
                                      aria-label={`Hapus ${member.nama_lengkap}`}
                                      className="inline-flex min-h-[34px] items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 sm:min-h-0"
                                    >
                                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                                      <span>Hapus</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <datalist id="drawer-pendidikan-list">
            {PENDIDIKAN_OPTIONS.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
          <datalist id="drawer-hubungan-list">
            {STATUS_HUBUNGAN_OPTIONS.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </section>
      </div>

      <ConfirmModal
        open={memberToDelete !== null}
        title="Hapus Anggota Keluarga"
        description={
          memberToDelete
            ? `Hapus ${memberToDelete.nama_lengkap} (NIK ${memberToDelete.nik}) dari Kartu Keluarga ${detail?.no_kk ?? ""}? Tindakan ini dicatat di audit log.`
            : ""
        }
        confirmLabel="Ya, Hapus Anggota"
        loading={deletingMember}
        onConfirm={() => void handleDeleteMemberConfirm()}
        onCancel={() => setMemberToDelete(null)}
      />
    </>
  );
}
