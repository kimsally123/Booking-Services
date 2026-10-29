// กติกาปฏิทินที่ใช้ทั้งหน้าจอและ server (ให้ตรงกันเสมอ)
import { addMonths, monthEnd } from './thaidate';

export const BOOK_AHEAD_MONTHS = 2;   // จองล่วงหน้าได้ไม่เกิน 2 เดือน
export const SHOW_MONTHS = 3;         // ปฏิทินเลื่อนดูได้ 3 เดือน
export const MAX_NIGHTS_PET = 30;     // Pet hotel
export const MAX_NIGHTS_PEOPLE = 14;  // Villa (ที่พักคน)

export const lastBookable = (today: string) => addMonths(today, BOOK_AHEAD_MONTHS);
export const lastShown = (today: string) => monthEnd(addMonths(today, SHOW_MONTHS - 1));
export const maxNights = (forPeople: boolean) => (forPeople ? MAX_NIGHTS_PEOPLE : MAX_NIGHTS_PET);
