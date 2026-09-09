export type VietnamWard = {
  name: string;
  code: number;
  division_type: string;
  codename: string;
  district_code: number;
};

export type VietnamDistrict = {
  name: string;
  code: number;
  division_type: string;
  codename: string;
  province_code: number;
  wards: VietnamWard[];
};

export type VietnamProvince = {
  name: string;
  code: number;
  division_type: string;
  codename: string;
  phone_code: number;
  districts: VietnamDistrict[];
};

export type AddressOption = {
  name: string;
  code: number;
};